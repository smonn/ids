// Pure lifecycle-status classification for the Phase 5 one-time backfill
// (ADR-0029 §Migration / ADR-0030). It reconstructs the namespaced `issue:` status
// that the Phase 2 dual-write would have written, so a historical OPEN issue ends up
// in the same lifecycle state a live one does.
//
// This module is the lifecycle counterpart of label-classifier.mjs (which owns the
// DESCRIPTIVE namespaces). It contains ZERO I/O — every function maps already-gathered
// inputs (current labels, timeline label events) to label strings. The backfill glue
// (backfill-labels.mjs) gathers the inputs from `gh` and applies the result.
//
// Scope (ADR-0029 §Backfill scope): lifecycle status is backfilled on OPEN items
// only — a closed item's state already IS "closed". The caller skips closed items;
// these functions assume an open one.
//
// PR lifecycle is intentionally NOT reconstructed here. The `pr:` namespace is new in
// this taxonomy — there is no retired flat label that mapped to a `pr:` review state
// (the old flat PR labels `needs-review` / `address-feedback` / `conflicting` became
// the `do:review` / `do:address` triggers and the `automation:rebasing` mutex, none of
// them a review STATUS). So an open PR has no historical source to backfill from; its
// `pr:` status is written by review.yml / address-review.yml going forward, and the
// Phase 2 dual-write already stamped any open PR that has been through review. Inventing
// a review state from nothing would be worse than leaving it unset, so the backfill
// leaves `pr:` lifecycle alone. Only the issue side has a faithful source.

// The single-select namespaced lifecycle value sets (mirrors lifecycle-status.sh).
export const ISSUE_STATUS_LABELS = [
  "issue:triage",
  "issue:needs-info",
  "issue:ready-agent",
  "issue:ready-human",
  "issue:in-progress",
  "issue:blocked",
  "issue:wontfix",
];

// Map a retired flat issue lifecycle label to its namespaced `issue:` equivalent.
// This is the JS mirror of `ns_issue_status` in .github/scripts/lifecycle-status.sh;
// the two must stay in lock-step (live dual-write vs. historical backfill).
const FLAT_ISSUE_STATUS = new Map([
  ["needs-triage", "issue:triage"],
  ["needs-info", "issue:needs-info"],
  ["ready-for-agent", "issue:ready-agent"],
  ["ready-for-human", "issue:ready-human"],
  ["in-progress", "issue:in-progress"],
  ["blocked", "issue:blocked"],
  ["wontfix", "issue:wontfix"],
]);

/**
 * Namespaced `issue:` status for a flat lifecycle label, or null when the flat
 * label has no `issue:` counterpart (e.g. `needs-human`, which stays flat).
 *
 * @param {string} flat
 * @returns {string | null}
 */
export function nsIssueStatus(flat) {
  return FLAT_ISSUE_STATUS.get(flat) ?? null;
}

/**
 * Reconstruct the flat issue lifecycle label an item last carried, from its
 * timeline label events in chronological order. Phase 4 deleted the flat labels,
 * which strips them from the items themselves — but a `labeled` / `unlabeled`
 * timeline event still records the (now-deleted) label NAME, so the last lifecycle
 * label is recoverable here. Returns null when no known flat lifecycle label was
 * ever applied (or the last one was removed).
 *
 * @param {Iterable<{ event: string, label: string }>} [events] chronological label events
 * @returns {string | null}
 */
export function flatLifecycleFromEvents(events = []) {
  let current = null;
  for (const { event, label } of events) {
    if (!FLAT_ISSUE_STATUS.has(label)) continue; // ignore non-lifecycle labels
    if (event === "labeled") current = label;
    else if (event === "unlabeled" && current === label) current = null;
  }
  return current;
}

/**
 * Compute the lifecycle backfill plan for one OPEN issue. Sources, in priority:
 *
 *   1. An `issue:*` status already present (the item was touched since the Phase 2
 *      dual-write) — keep it; the backfill only de-duplicates stray siblings.
 *   2. The flat lifecycle label recovered from the timeline, mapped to `issue:*`.
 *   3. Default `issue:triage` — an open issue with no lifecycle history is awaiting
 *      maintainer evaluation, the taxonomy's entry state (== the retired
 *      `needs-triage`). This is a STATUS write and triggers nothing (ADR-0030).
 *
 * Single-select is enforced the way the ADR describes: any other `issue:*` value
 * present is removed so exactly one remains.
 *
 * @param {{ current?: Iterable<string>, events?: Iterable<{ event: string, label: string }> }} [input]
 * @returns {{ add: string[], remove: string[] }}
 */
export function issueLifecyclePlan({ current = [], events = [] } = {}) {
  const currentList = [...current];
  const present = currentList.filter((label) => ISSUE_STATUS_LABELS.includes(label));

  let want;
  if (present.length > 0) {
    want = present[0]; // already namespaced — keep the existing status
  } else {
    const flat = flatLifecycleFromEvents(events);
    want = (flat && nsIssueStatus(flat)) || "issue:triage";
  }

  const add = currentList.includes(want) ? [] : [want];
  const remove = present.filter((label) => label !== want);
  return { add, remove };
}
