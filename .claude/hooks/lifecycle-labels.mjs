// Single authoritative LIFECYCLE set — imported by both guard hooks so the
// two enforced label lists cannot drift from each other.
//
// `address-feedback` and `needs-review` are deliberately ABSENT: they pass
// through by omission, not via a positive allowlist. See AGENTS.md and
// docs/agents/triage-labels.md for the reasoning.
export const LIFECYCLE = new Set([
  "blocked",
  "needs-triage",
  "ready-for-agent",
  "ready-for-human",
  "in-progress",
  "needs-info",
  "wontfix",
  "needs-human",
  "needs-rebase",
]);
