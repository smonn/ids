#!/usr/bin/env node
// PreToolUse guard for mcp__github__issue_write.
//
// Denies any issue create/update that sets a pipeline/triage lifecycle label.
// Those transitions are owned exclusively by the .github/workflows App
// automations (triage.yml / unblock.yml / implement.yml). An agent setting them
// by hand races the bot — see docs/agents/triage-labels.md.
//
// Updates that omit `labels` (body/title/state-only) pass through untouched, as
// do issue writes whose labels are all non-lifecycle (e.g. just `enhancement`).
import { readFileSync } from "node:fs";

const LIFECYCLE = new Set([
  "blocked",
  "needs-triage",
  "ready-for-agent",
  "ready-for-human",
  "in-progress",
  "needs-info",
  "wontfix",
  "needs-human",
  "needs-review",
  "needs-rebase",
  "address-feedback",
]);

let input;
try {
  input = JSON.parse(readFileSync(0, "utf8"));
} catch {
  process.exit(0); // unparseable stdin — fail open, don't block
}

const labels = input?.tool_input?.labels;
if (!Array.isArray(labels)) process.exit(0);

const offending = labels.filter((label) => LIFECYCLE.has(label));
if (offending.length === 0) process.exit(0);

const reason =
  `Refusing to set pipeline/triage label(s) [${offending.join(", ")}] via issue_write. ` +
  `These labels are owned by the .github/workflows App automations ` +
  `(triage.yml / unblock.yml / implement.yml); setting them by hand races the bot. ` +
  `Omit the labels field and let triage re-evaluate. See docs/agents/triage-labels.md.`;

process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: reason,
    },
  }),
);
process.exit(0);
