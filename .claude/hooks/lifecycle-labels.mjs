// Single authoritative LIFECYCLE set — imported by both guard hooks so the
// two enforced label lists cannot drift from each other.
//
// A label in this set is one the .github/workflows/ App automations own; an agent
// must not hand-set it (doing so races the bot). The hooks deny any agent
// issue_write / `gh issue edit` that touches one.
//
// Phase 4 of the namespaced taxonomy (ADR-0029 / ADR-0030) has retired the flat
// lifecycle/trigger labels: this set now lists the namespaced status labels and
// the maintainer-only `do:*` triggers. `needs-human` is the lone surviving flat
// label (it stays un-namespaced per ADR-0029) and remains guarded.
//
// DELIBERATELY ABSENT (pass through by omission, NOT a positive allowlist) —
// the `do:review` / `do:address` review-lifecycle triggers. A PreToolUse hook
// cannot verify actor identity, so any agent session may set these; the trade-off
// is accepted because they drive the REVIEW lifecycle (re-run automated review /
// address PR feedback), not the triage lifecycle. The other triggers —
// `do:implement` / `do:rebase` / `do:triage` — are maintainer kickoff controls,
// so they ARE listed. See AGENTS.md and docs/agents/triage-labels.md.
export const LIFECYCLE = new Set([
  // The lone surviving flat label (cross-cutting escalation, ADR-0029).
  "needs-human",

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
