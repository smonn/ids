// Pure classification functions for the namespaced label taxonomy (ADR-0029).
//
// This module contains ZERO I/O — no git, no gh, no filesystem, no network. Every
// function maps already-gathered inputs (a PR title, a changed-path list, a numstat
// blob, an issue body) to label strings. The Phase 1 auto-labelling workflows
// (pr-labels.yml / issue-labels.yml) gather the inputs and apply the result; the
// Phase 5 one-time backfill imports THESE SAME functions so historical and live
// labels are produced by identical logic (ADR-0029 §Migration).
//
// Everything here is descriptive STATUS (ADR-0030): the labels these functions
// produce never appear in any workflow's `labeled` filter, so applying them
// triggers nothing.

// ── type: ────────────────────────────────────────────────────────────────────
// Rides the Conventional-Commit vocabulary already enforced on PR titles by
// pr-title.yml, so a PR's `type:` can never disagree with its own title.
const CONVENTIONAL_TYPES = new Set([
  "feat",
  "fix",
  "docs",
  "refactor",
  "perf",
  "test",
  "build",
  "ci",
  "chore",
  "revert",
]);

/**
 * Derive the `type:` label from a Conventional-Commit PR title. Mirrors the
 * grammar in pr-title.yml (`<type>(<optional scope>)!: <subject>`). Returns null
 * when the title is not a recognised Conventional-Commit subject (e.g. the
 * Changesets "Version Packages" release PR), so the caller leaves `type:` alone.
 *
 * @param {string | null | undefined} title
 * @returns {string | null}
 */
export function typeFromTitle(title) {
  const match = /^([a-z]+)(?:\([^)]*\))?!?:\s/.exec(title ?? "");
  if (!match) return null;
  const type = match[1];
  return CONVENTIONAL_TYPES.has(type) ? `type:${type}` : null;
}

/**
 * Derive the `type:` label for an issue from its template-applied label. The
 * issue templates apply `bug` / `enhancement`; ADR-0029 maps only those two onto
 * the unified Conventional-Commit vocabulary. Returns null for anything else.
 *
 * @param {Iterable<string>} labels
 * @returns {string | null}
 */
export function typeFromIssueLabels(labels) {
  const set = new Set(labels);
  if (set.has("bug")) return "type:fix";
  if (set.has("enhancement")) return "type:feat";
  return null;
}

// ── size: ────────────────────────────────────────────────────────────────────
// Calibrated ABSOLUTE churn, not a percentage (ADR-0029 §size). Thresholds are
// tuned to the measured ~6k production LoC.

/**
 * Bucket total diff churn (additions + deletions) into a `size:` label.
 *
 * @param {number} churn
 * @returns {string}
 */
export function sizeFromChurn(churn) {
  if (churn <= 10) return "size:xs";
  if (churn <= 50) return "size:s";
  if (churn <= 150) return "size:m";
  if (churn <= 400) return "size:l";
  return "size:xl";
}

// Generated/vendored files excluded from churn. This mirrors the `.gitattributes`
// `linguist-generated=true` set: lockfiles are machine-produced and not reviewable
// content. spec/vectors.json and the depcruise fixtures are reviewable and are
// intentionally NOT excluded here (ADR-0029 §size).
const GENERATED_BASENAMES = new Set([
  "pnpm-lock.yaml",
  "package-lock.json",
  "npm-shrinkwrap.json",
  "yarn.lock",
  "bun.lockb",
]);

/**
 * Whether a path is a generated/vendored file excluded from churn.
 *
 * @param {string} path
 * @returns {boolean}
 */
export function isGeneratedPath(path) {
  const basename = path.split("/").pop() ?? path;
  return GENERATED_BASENAMES.has(basename);
}

/**
 * Sum reviewable churn from `git diff --numstat` output. Each line is
 * `<additions>\t<deletions>\t<path>`; binary files report `-` for both counts
 * and contribute nothing, and generated paths are excluded.
 *
 * @param {string} numstat
 * @returns {number}
 */
export function churnFromNumstat(numstat) {
  let total = 0;
  for (const line of numstat.split("\n")) {
    if (!line.trim()) continue;
    const parts = line.split("\t");
    if (parts.length < 3) continue;
    const additions = parts[0];
    const deletions = parts[1];
    const path = parts.slice(2).join("\t");
    if (additions === "-" || deletions === "-") continue; // binary
    if (isGeneratedPath(path)) continue;
    total += Number(additions) + Number(deletions);
  }
  return total;
}

// ── codec: ───────────────────────────────────────────────────────────────────
// Which codec slice (ADR-0018) a change touches, from its source path. The
// shared `_kernel` is not a codec variant and maps to no `codec:` value.
const CODEC_DIRECTORIES = new Set([
  "timestamp",
  "opaque",
  "reverse",
  "signed",
  "wrapped",
  "digest",
]);

/**
 * Derive the `codec:*` labels a set of changed paths touches.
 *
 * @param {Iterable<string>} paths
 * @returns {string[]} sorted, de-duplicated `codec:*` labels
 */
export function codecsFromPaths(paths) {
  const found = new Set();
  for (const path of paths) {
    const match = /^src\/codecs\/([^/]+)\//.exec(path);
    if (match && CODEC_DIRECTORIES.has(match[1])) found.add(`codec:${match[1]}`);
  }
  return [...found].sort();
}

// ── area: ────────────────────────────────────────────────────────────────────
// Which part of the system a change touches. Coarse on purpose (ADR-0029): no
// per-adapter namespace; `area:adapters` covers every integration shim.

/**
 * Map a single changed path to its `area:` label, or null when none applies.
 *
 * @param {string} path
 * @returns {string | null}
 */
function areaForPath(path) {
  if (path.startsWith("src/wire/") || path.startsWith("spec/")) return "area:wire";
  if (path.startsWith("src/cli/") || path.startsWith("bin/")) return "area:cli";
  if (path.startsWith("src/adapters/")) return "area:adapters";
  if (path.startsWith(".changeset/")) return "area:build";
  if (path.startsWith("docs/") || path.startsWith("website/") || path.endsWith(".md"))
    return "area:docs";
  if (path.startsWith("src/")) return "area:core";
  // Everything else — .github/, root configs (package.json, tsconfig, tsdown,
  // vitest, oxlint/oxfmt, depcruise), test harness — is build/tooling.
  return "area:build";
}

/**
 * Derive the `area:*` labels a set of changed paths touches.
 *
 * @param {Iterable<string>} paths
 * @returns {string[]} sorted, de-duplicated `area:*` labels
 */
export function areasFromPaths(paths) {
  const found = new Set();
  for (const path of paths) {
    const area = areaForPath(path);
    if (area) found.add(area);
  }
  return [...found].sort();
}

// ── changeset: ───────────────────────────────────────────────────────────────
// Sourced from the `.changeset/*.md` frontmatter a PR introduces. The highest
// declared bump wins; a PR with no changeset is `changeset:none`.
const BUMP_RANK = { major: 3, minor: 2, patch: 1, none: 0 };

/**
 * Parse the `@smonn/ids` bump declared in one changeset file's frontmatter.
 *
 * @param {string} content
 * @returns {"major" | "minor" | "patch" | null}
 */
export function bumpFromChangeset(content) {
  const frontmatter = /^---\s*\n([\s\S]*?)\n---/.exec(content);
  if (!frontmatter) return null;
  const match = /["']?@smonn\/ids["']?\s*:\s*(major|minor|patch)/.exec(frontmatter[1]);
  return match ? /** @type {"major" | "minor" | "patch"} */ (match[1]) : null;
}

/**
 * Reduce a list of declared bumps to the single `changeset:` label (highest
 * bump wins; empty list → `changeset:none`).
 *
 * @param {Iterable<"major" | "minor" | "patch" | "none">} bumps
 * @returns {string}
 */
export function changesetFromBumps(bumps) {
  let best = "none";
  for (const bump of bumps) {
    if ((BUMP_RANK[bump] ?? 0) > BUMP_RANK[best]) best = bump;
  }
  return `changeset:${best}`;
}

// ── issue dropdowns → codec: / area: ─────────────────────────────────────────
// GitHub renders an issue-form field as `### <label>` followed by the selected
// value(s); a multi-select dropdown joins selections with ", ". These maps mirror
// the option text in .github/ISSUE_TEMPLATE/{bug_report,feature_request}.yml.
// "Not sure …" options map to nothing, so an unsure reporter applies no label.
const CODEC_DROPDOWN = new Map([
  ["timestamp codec", "codec:timestamp"],
  ["opaque timestamp codec", "codec:opaque"],
  ["reverse timestamp codec", "codec:reverse"],
  ["wrapped key codec", "codec:wrapped"],
  ["signed timestamp codec", "codec:signed"],
  ["digest codec", "codec:digest"],
]);

// The "Affected surface" options don't line up one-to-one with `area:` values:
// "Public API" and "Internal implementation" both land on `area:core`, and the
// dropdown has no adapters option (area:adapters is PR-path-sourced only).
const SURFACE_DROPDOWN = new Map([
  ["public api", "area:core"],
  ["wire format", "area:wire"],
  ["cli behavior", "area:cli"],
  ["documentation", "area:docs"],
  ["internal implementation", "area:core"],
]);

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Read the value line(s) of a rendered issue-form field by its heading.
 *
 * @param {string} body
 * @param {string} heading
 * @returns {string}
 */
function fieldValue(body, heading) {
  const re = new RegExp(`(?:^|\\n)###\\s+${escapeRegExp(heading)}\\s*\\n+([^\\n]+)`, "i");
  const match = re.exec(body ?? "");
  return match ? match[1].trim() : "";
}

function mapDropdown(value, map) {
  const found = new Set();
  for (const part of value.split(",")) {
    const label = map.get(part.trim().toLowerCase());
    if (label) found.add(label);
  }
  return [...found].sort();
}

/**
 * Derive `codec:*` labels from the "Relevant codec variant" issue-form dropdown.
 *
 * @param {string} body
 * @returns {string[]}
 */
export function codecsFromIssueBody(body) {
  return mapDropdown(fieldValue(body, "Relevant codec variant"), CODEC_DROPDOWN);
}

/**
 * Derive `area:*` labels from the "Affected surface" issue-form dropdown.
 *
 * @param {string} body
 * @returns {string[]}
 */
export function areasFromIssueBody(body) {
  return mapDropdown(fieldValue(body, "Affected surface"), SURFACE_DROPDOWN);
}

// ── reconciliation ───────────────────────────────────────────────────────────

/**
 * Compute the minimal label add/remove sets to move `current` to `desired`
 * within the managed namespaces. Labels outside `managedPrefixes` are never
 * touched — this is what keeps the descriptive labeller from disturbing
 * lifecycle (`issue:`/`pr:`), trigger (`do:*`), or escalation (`needs-human`)
 * labels. A single-select namespace is reconciled by removing its stale value
 * and adding the new one; a multi-select namespace converges to exactly the
 * desired set.
 *
 * @param {Iterable<string>} current
 * @param {Iterable<string>} desired
 * @param {string[]} managedPrefixes
 * @returns {{ add: string[], remove: string[] }}
 */
export function reconcileLabels(current, desired, managedPrefixes) {
  const currentList = [...current];
  const desiredList = [...desired];
  const currentSet = new Set(currentList);
  const desiredSet = new Set(desiredList);
  const isManaged = (label) => managedPrefixes.some((prefix) => label.startsWith(prefix));
  const add = desiredList.filter((label) => !currentSet.has(label));
  const remove = currentList.filter((label) => isManaged(label) && !desiredSet.has(label));
  return { add, remove };
}
