// Single authoritative LIFECYCLE set — imported by both guard hooks so the
// two enforced label lists cannot drift from each other.
//
// A label in this set is one the .github/workflows/ App automations own; an agent
// must not hand-set it (doing so races the bot). The hooks deny any agent
// issue_write / `gh issue edit` that touches one.
//
// Phase 3 of the namespaced taxonomy (ADR-0029 / ADR-0030) adds the namespaced
// status labels and the maintainer-only `do:*` triggers here, in lock-step with
// the workflows accepting `do:*` as triggers. The flat labels stay listed through
// the cutover; they are removed when Phase 4 retires them.
//
// DELIBERATELY ABSENT (pass through by omission, NOT a positive allowlist) —
// `needs-review` / `address-feedback` and their `do:*` successors `do:review` /
// `do:address`. A PreToolUse hook cannot verify actor identity, so any agent
// session may set these; the trade-off is accepted because they drive the REVIEW
// lifecycle (re-run automated review / address PR feedback), not the triage
// lifecycle. The other triggers — `do:implement` / `do:rebase` / `do:triage` —
// are maintainer kickoff controls (their flat predecessors `ready-for-agent` /
// `needs-rebase` / `needs-triage` are denied), so they ARE listed. See AGENTS.md
// and docs/agents/triage-labels.md for the reasoning.
export const LIFECYCLE = new Set([
  // Flat lifecycle labels (authoritative through the Phase 3–4 cutover).
  "blocked",
  "needs-triage",
  "ready-for-agent",
  "ready-for-human",
  "in-progress",
  "needs-info",
  "wontfix",
  "needs-human",
  "needs-rebase",

  // Namespaced issue: lifecycle status (ADR-0029).
  "issue:triage",
  "issue:ready-agent",
  "issue:ready-human",
  "issue:in-progress",
  "issue:blocked",
  "issue:needs-info",
  "issue:wontfix",

  // Namespaced pr: lifecycle status (ADR-0029).
  "pr:reviewing",
  "pr:changes-requested",
  "pr:addressing-feedback",
  "pr:ready",
  "pr:outdated",

  // Automation pause-mutex (ADR-0029).
  "automation:rebasing",

  // Maintainer-only kickoff triggers (ADR-0030). do:review / do:address are
  // intentionally NOT here — see the header carve-out.
  "do:implement",
  "do:rebase",
  "do:triage",
]);
