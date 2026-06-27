// One-time Phase 5 backfill for the namespaced label taxonomy (ADR-0029 §Migration).
//
// This is GLUE, not classification: it gathers each item's data from `gh` and feeds it
// to the SAME pure functions the Phase 1 live workflows use — planPrLabels /
// planIssueDescriptiveLabels (label-classifier.mjs) for the mechanical descriptive
// labels, and issueLifecyclePlan (lifecycle-classifier.mjs) for open-issue lifecycle
// status. Live and historical labels are therefore produced by identical logic.
//
// What it applies (ADR-0029 §Backfill scope):
//   • Mechanical descriptive labels — type:/size:/codec:/area:/changeset: on PRs and
//     type:/codec:/area: on issues — across OPEN AND CLOSED items. These are status
//     labels (ADR-0030): no workflow filters on them, so applying them triggers nothing.
//   • Lifecycle status (issue:) on OPEN issues only — a closed item's state already IS
//     "closed". PR `pr:` lifecycle is deliberately not backfilled (no historical source;
//     see lifecycle-classifier.mjs).
//   • Skipped now: released:* (no tags yet — release.yml stamps released:v1 when v1 cuts).
//
// Safety: DRY-RUN by default. It prints the planned add/remove per item and mutates
// nothing unless `--apply` is passed. ~700 items × a few API calls is minutes of work,
// far under rate limits, and (being all status labels) starts no pipeline work.
//
// Usage:
//   GH_REPO=owner/name node .github/scripts/backfill-labels.mjs [--apply] [--scope=all|prs|issues] [--limit=N]
// Requires an authenticated `gh` (GH_TOKEN) with contents:read, issues:write and
// pull-requests:write — provided by backfill-labels.yml's App token.

import { execFileSync } from "node:child_process";
import { planIssueDescriptiveLabels, planPrLabels } from "./label-classifier.mjs";
import { issueLifecyclePlan } from "./lifecycle-classifier.mjs";

// ── args ─────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const apply = argv.includes("--apply");
const scope = (argv.find((a) => a.startsWith("--scope=")) ?? "--scope=all").split("=")[1];
const limit = Number((argv.find((a) => a.startsWith("--limit=")) ?? "--limit=1000").split("=")[1]);

const repo = process.env.GH_REPO;
if (!repo) {
  console.error("GH_REPO must be set (owner/name).");
  process.exit(1);
}

// ── gh helpers ───────────────────────────────────────────────────────────────
function gh(args) {
  return execFileSync("gh", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}
function ghJson(args) {
  const out = gh(args).trim();
  return out ? JSON.parse(out) : null;
}

// Apply (or, in dry-run, print) a single add/remove plan for one item. `kind` is
// "issue" or "pr"; the two share the same `gh <kind> edit` label flags.
let mutated = 0;
function applyPlan(kind, number, plan) {
  const add = [...new Set(plan.add)];
  const remove = [...new Set(plan.remove)];
  if (add.length === 0 && remove.length === 0) {
    console.log(`  ${kind} #${number}: already current`);
    return;
  }
  console.log(`  ${kind} #${number}: +[${add.join(", ")}] -[${remove.join(", ")}]`);
  mutated++;
  if (!apply) return;
  const args = [kind, "edit", String(number)];
  if (add.length > 0) args.push("--add-label", add.join(","));
  if (remove.length > 0) args.push("--remove-label", remove.join(","));
  gh(args);
}

// Merge two plans into one edit (mechanical + lifecycle for an open issue).
function mergePlans(a, b) {
  return { add: [...a.add, ...b.add], remove: [...a.remove, ...b.remove] };
}

// ── PRs ──────────────────────────────────────────────────────────────────────
function backfillPrs() {
  const prs = ghJson([
    "pr",
    "list",
    "--repo",
    repo,
    "--state",
    "all",
    "--limit",
    String(limit),
    "--json",
    "number",
  ]);
  console.log(`PRs: ${prs.length}`);
  for (const { number } of prs) {
    // One read for the descriptive inputs. `files` carries additions/deletions so
    // churn needs no checkout (mirrors pr-labels.yml); using the head SHA keeps the
    // changeset read working even after a merged PR's branch is deleted.
    const data = ghJson([
      "pr",
      "view",
      String(number),
      "--repo",
      repo,
      "--json",
      "title,labels,files,headRefOid",
    ]);
    const files = (data.files ?? []).map((f) => f.path);
    const numstat = (data.files ?? [])
      .map((f) => `${f.additions}\t${f.deletions}\t${f.path}`)
      .join("\n");
    const changesets = readChangesets(data.files ?? [], data.headRefOid);

    const plan = planPrLabels({
      title: data.title ?? "",
      current: (data.labels ?? []).map((l) => l.name),
      files,
      numstat,
      changesets,
    });
    applyPlan("pr", number, plan);
  }
}

// Read each introduced `.changeset/*.md` (raw, at the PR head SHA) so the highest
// declared bump becomes the changeset: label. A missing/unreadable file degrades to
// no bump, exactly as pr-labels.yml does live.
function readChangesets(files, headSha) {
  const out = [];
  for (const { path } of files) {
    if (!path.startsWith(".changeset/") || !path.endsWith(".md")) continue;
    if (path === ".changeset/README.md") continue;
    try {
      out.push(
        gh([
          "api",
          `repos/${repo}/contents/${path}?ref=${headSha}`,
          "-H",
          "Accept: application/vnd.github.raw",
        ]),
      );
    } catch {
      // 404 (file gone) or transient — treat as no changeset for this path.
    }
  }
  return out;
}

// ── issues ───────────────────────────────────────────────────────────────────
function backfillIssues() {
  const issues = ghJson([
    "issue",
    "list",
    "--repo",
    repo,
    "--state",
    "all",
    "--limit",
    String(limit),
    "--json",
    "number,state,labels,body",
  ]);
  console.log(`issues: ${issues.length}`);
  for (const issue of issues) {
    const labels = (issue.labels ?? []).map((l) => l.name);
    const plan = planIssueDescriptiveLabels({
      body: issue.body ?? "",
      labels,
      current: labels,
    });

    // Lifecycle status: OPEN issues only. Recover the namespaced issue: status from
    // the timeline (or default to issue:triage); merge it into the same edit.
    if (issue.state === "OPEN") {
      const events = labelEvents(issue.number);
      const lifecycle = issueLifecyclePlan({ current: labels, events });
      applyPlan("issue", issue.number, mergePlans(plan, lifecycle));
    } else {
      applyPlan("issue", issue.number, plan);
    }
  }
}

// The chronological labeled/unlabeled events for an issue, normalised to
// { event, label } for flatLifecycleFromEvents. Only fetched for open issues, so
// the extra call is cheap. Events for now-deleted labels still carry their name.
function labelEvents(number) {
  const events = ghJson(["api", "--paginate", `repos/${repo}/issues/${number}/events`]) ?? [];
  return events
    .filter((e) => e.event === "labeled" || e.event === "unlabeled")
    .map((e) => ({ event: e.event, label: e.label?.name ?? "" }));
}

// ── run ──────────────────────────────────────────────────────────────────────
console.log(`Backfill (${apply ? "APPLY" : "dry-run"}) on ${repo}, scope=${scope}, limit=${limit}`);
if (scope === "all" || scope === "prs") backfillPrs();
if (scope === "all" || scope === "issues") backfillIssues();
console.log(`Done. ${mutated} item(s) ${apply ? "updated" : "would change"}.`);
