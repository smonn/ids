// CI lint for the no-status-triggers invariant (ADR-0030, Phase 4 of ADR-0029).
//
// THE INVARIANT: no status label ever triggers a workflow; every workflow start is
// a `do:*` trigger or a native git event. Because no status label may appear in a
// `labeled` filter, the rule is mechanically checkable — this module is that check.
//
// For every workflow that listens on a `labeled` activity type, each job's `if`
// expression may compare `github.event.label.name` only against `do:*` values, and
// the workflow must gate on at least one such `do:*` label. A status label name in a
// `labeled`-gated `if` (a status-as-trigger) is a violation.
//
// EXEMPTIONS: a workflow may gate the trigger inside a step instead of the job `if`
// (e.g. review.yml always runs so its required `review` check reports on the head
// commit, then decides scope — including the `do:review` re-review label — in a
// step). Such a workflow is exempt from the job-`if` assertion but must still
// reference a `do:*` label somewhere in its body, which is asserted separately.
//
// This module is pure (the parsed workflow docs are passed in) so it is unit-tested
// in the sibling .test.mjs; it also runs standalone — `node label-trigger-lint.mjs`
// globs the real workflows and exits non-zero on any violation.

import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

// Workflows that legitimately listen on `labeled` but gate the trigger in a step
// rather than the job-level `if`. Keep this list tight — every entry is verified to
// be live (listens on labeled, references a do:* label) by the test.
export const STEP_GATED_EXEMPTIONS = new Set(["review.yml"]);

// Does this parsed workflow listen on a `labeled` activity type for any event?
export function listensOnLabeled(doc) {
  const on = doc?.on;
  if (!on || typeof on !== "object") return false;
  for (const event of ["issues", "pull_request", "pull_request_target"]) {
    const types = on[event]?.types;
    if (Array.isArray(types) && types.includes("labeled")) return true;
  }
  return false;
}

// Every value compared against github.event.label.name in an expression string
// (handles single- and double-quoted literals).
export function labelNameComparisons(expr) {
  if (typeof expr !== "string") return [];
  const out = [];
  const re = /github\.event\.label\.name\s*==\s*(['"])([^'"]*)\1/g;
  let match;
  while ((match = re.exec(expr)) !== null) out.push(match[2]);
  return out;
}

const isDoTrigger = (label) => label.startsWith("do:");

// Find every violation of the invariant across the given workflows.
// `workflows` is an array of { name, text, doc }. Returns an array of
// { name, reason } — empty means the invariant holds.
export function findLabelTriggerViolations(workflows, exemptions = STEP_GATED_EXEMPTIONS) {
  const violations = [];

  for (const { name, text, doc } of workflows) {
    if (!listensOnLabeled(doc)) continue;

    if (exemptions.has(name)) {
      // A step-gated exemption is only acceptable while it still gates on a do:*
      // label somewhere — otherwise the exemption would mask a regression.
      if (!/\bdo:[a-z]+/.test(text)) {
        violations.push({
          name,
          reason: `listens on \`labeled\` and is exempt from the job-\`if\` rule, but no \`do:*\` label appears anywhere in the file — the in-step gate is missing.`,
        });
      }
      continue;
    }

    // The invariant is per-JOB (ADR-0030): "every job gated on a `labeled` event
    // filters on a `do:*` label." Check each job's own `if`. A top-level job (one
    // without `needs:`) in a labeled-listening workflow is directly reachable by the
    // labeled event, so it must gate on a `do:*` label; a `needs:`-chained job is
    // gated transitively by its upstream and is exempt from the do:*-presence arm
    // (but a status label in its `if` is still a violation).
    const jobs = doc?.jobs && typeof doc.jobs === "object" ? doc.jobs : {};
    for (const [jobId, job] of Object.entries(jobs)) {
      const comparisons = labelNameComparisons(job?.if);

      const statusTriggers = comparisons.filter((label) => !isDoTrigger(label));
      if (statusTriggers.length > 0) {
        violations.push({
          name,
          reason: `job \`${jobId}\` filters on non-\`do:*\` label(s) [${[...new Set(statusTriggers)].join(", ")}] — a status label must never trigger a workflow.`,
        });
      }

      const isTopLevel = job?.needs === undefined;
      if (isTopLevel && !comparisons.some(isDoTrigger)) {
        violations.push({
          name,
          reason: `job \`${jobId}\` is reachable on the \`labeled\` event but its \`if\` does not filter on a \`do:*\` label — the trigger is unguarded.`,
        });
      }
    }
  }

  return violations;
}

// Load and parse every .github/workflows/*.yml file under the given directory.
export function loadWorkflows(dir) {
  return readdirSync(dir)
    .filter((file) => file.endsWith(".yml") || file.endsWith(".yaml"))
    .map((file) => {
      const text = readFileSync(`${dir}/${file}`, "utf8");
      return { name: file, text, doc: parse(text) };
    });
}

// Standalone entry point: lint the real workflow directory and exit non-zero on
// any violation, so this can run as a CI step independent of the test runner.
function main() {
  const dir = fileURLToPath(new URL("../workflows", import.meta.url));
  const violations = findLabelTriggerViolations(loadWorkflows(dir));
  if (violations.length === 0) {
    console.log("✓ no-status-triggers invariant holds across all workflows.");
    return;
  }
  console.error("✗ no-status-triggers invariant violated (ADR-0030):");
  for (const { name, reason } of violations) console.error(`  - ${name}: ${reason}`);
  process.exit(1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
