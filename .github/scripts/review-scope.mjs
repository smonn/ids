// Pure scope/defer decision for the automated review pipeline (review.yml) and the
// stale-status cleanup shared with address-review.yml.
//
// This module contains ZERO I/O. It is the JS mirror of the inline bash in
// `.github/workflows/review.yml`'s `scope` step (and the `automation:*` mutex defer in
// `address-review.yml`'s gate). The bash is authoritative at runtime — those steps run
// BEFORE the repo is checked out, so they cannot call this file — and these functions
// exist to make the decision unit-testable and to lock its rules against regression.
// The two MUST stay in lock-step (live bash vs. tested mirror), the same contract
// lifecycle-classifier.mjs holds with lifecycle-status.sh.
//
// The governing rules (ADR-0029 / ADR-0030):
//   - A review's scope depends ONLY on the event type, the head branch, the `do:review`
//     trigger, and whether an `automation:*` pause-mutex is present. It NEVER depends on
//     how many labels a PR carries or how many just changed: a status/descriptive label
//     write is not a review trigger, so it can neither start nor cancel a review.
//   - While any `automation:*` mutex is present the review DEFERS (a conflict-rebase is
//     in flight and this commit is about to be superseded). A deferral must not strand
//     the in-progress `pr:reviewing` status a superseded run left behind.

// The `do:review` trigger and the namespaced in-progress statuses these workflows own.
export const REVIEW_TRIGGER = "do:review";
export const REVIEWING_STATUS = "pr:reviewing";
export const ADDRESSING_STATUS = "pr:addressing-feedback";

// The pause-mutex namespace (ADR-0029): any `automation:*` label means a branch-mutation
// (conflict rebase) is in flight, so every PR-triggered workflow defers while present.
const MUTEX_PREFIX = "automation:";

/**
 * Is a conflict-rebase pause-mutex present? True iff any label is in the
 * `automation:*` namespace.
 *
 * @param {Iterable<string>} [labels]
 * @returns {boolean}
 */
export function mutexPresent(labels = []) {
  return [...labels].some((label) => label.startsWith(MUTEX_PREFIX));
}

/**
 * Decide whether review.yml should review the PR for this event.
 *
 * Returns one of three decisions, mirroring the `scope` step:
 *   - `{ review: true,  deferred: false }` — in scope, run the review.
 *   - `{ review: false, deferred: true  }` — in scope but an `automation:*` mutex is
 *     present, so DEFER (report success without reviewing; the rebase merge commit
 *     re-fires review with the mutex cleared).
 *   - `{ review: false, deferred: false }` — out of scope (not an agent PR / not a
 *     review-triggering event); report success without reviewing.
 *
 * Crucially the decision does NOT look at the label COUNT — only at the event, the
 * `do:review` trigger, the head repo/branch, and the mutex. Adding or removing any
 * number of status/descriptive labels cannot move a PR in or out of scope.
 *
 * @param {{
 *   eventName?: string,
 *   action?: string,
 *   label?: string,
 *   headRepo?: string,
 *   thisRepo?: string,
 *   headRef?: string,
 *   labels?: Iterable<string>,
 * }} input
 * @returns {{ review: boolean, deferred: boolean, reason: string }}
 */
export function reviewScope({
  eventName,
  action,
  label,
  headRepo,
  thisRepo,
  headRef = "",
  labels = [],
} = {}) {
  // Manual dispatch always reviews the named PR.
  if (eventName === "workflow_dispatch") {
    return mutexPresent(labels)
      ? { review: false, deferred: true, reason: "automation-mutex" }
      : { review: true, deferred: false, reason: "manual-dispatch" };
  }

  // A `labeled` event is in scope ONLY for the `do:review` re-review trigger. Every
  // other label write (a status like `pr:reviewing`, a descriptive `area:*`/`size:*`,
  // …) is not a trigger — it never starts a review (ADR-0030). Non-`labeled` events
  // (opened/reopened/synchronize) establish/refresh the head commit and are in scope.
  const triggeringEvent = action !== "labeled" || label === REVIEW_TRIGGER;
  const sameRepo = headRepo != null && headRepo === thisRepo;
  const agentBranch = headRef.startsWith("agent/issue-");

  if (!(triggeringEvent && sameRepo && agentBranch)) {
    return { review: false, deferred: false, reason: "out-of-scope" };
  }

  // In scope by event/branch, but pause while a conflict rebase is in flight.
  if (mutexPresent(labels)) {
    return { review: false, deferred: true, reason: "automation-mutex" };
  }

  return { review: true, deferred: false, reason: "in-scope" };
}

/**
 * The in-progress status label(s) to clear when a workflow stops without reaching its
 * outcome step (the deferred/out-of-scope path). A superseded or cancelled run can leave
 * `pr:reviewing` / `pr:addressing-feedback` set; if the workflow now no-ops it must clear
 * that stale status so the PR isn't stranded mid-lifecycle. Returns the single status if
 * present, else an empty list — idempotent, safe to call unconditionally.
 *
 * @param {Iterable<string>} labels current PR labels
 * @param {string} status the in-progress status this workflow owns (e.g. `pr:reviewing`)
 * @returns {string[]}
 */
export function staleStatusToClear(labels = [], status) {
  return [...labels].includes(status) ? [status] : [];
}
