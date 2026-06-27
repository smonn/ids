#!/usr/bin/env node
// PreToolUse guard for Bash: denies `gh issue edit` calls that add or remove
// a pipeline/triage lifecycle label — mirrors guard-pipeline-labels.mjs for
// the gh CLI path.
//
// The gh CLI is the path documented in docs/agents/issue-tracker.md for
// label management; this hook enforces the same prohibition as the MCP guard
// on that path. Both hooks share the LIFECYCLE set from lifecycle-labels.mjs
// so the two lists cannot drift.
//
// `do:review` and `do:address` are absent from LIFECYCLE (same
// omission-based carve-out as the MCP guard). Any other Bash command passes
// through untouched — the hook only acts when the command string contains
// `gh issue edit` with `--add-label` or `--remove-label`.
//
// Note: this hook covers Claude agent Bash sessions only. gh CLI calls from
// .github/workflows/ CI steps are not routed through Claude's Bash tool and
// are unaffected.
import { readFileSync } from "node:fs";
import { LIFECYCLE } from "./lifecycle-labels.mjs";

let input;
try {
  input = JSON.parse(readFileSync(0, "utf8"));
} catch {
  process.exit(0); // unparseable stdin — fail open, don't block
}

const command = input?.tool_input?.command;
if (typeof command !== "string") process.exit(0);

// Only act on commands that touch `gh issue edit`
if (!command.includes("gh issue edit")) process.exit(0);

// Extract all values supplied to --add-label and --remove-label.
// Handles space-separated and equals-separated forms:
//   --add-label "a,b"  --add-label 'a,b'  --add-label a
//   --add-label="a,b"  --add-label='a,b'  --add-label=a
// and comma-separated values within a single flag value.
const labelPattern =
  /--(?:add|remove)-label(?:\s+|=)(?:"([^"]*)"|'([^']*)'|(\S+))/g;
const labels = [];
let match;
while ((match = labelPattern.exec(command)) !== null) {
  const value = match[1] ?? match[2] ?? match[3] ?? "";
  for (const part of value.split(",")) {
    const trimmed = part.trim();
    if (trimmed) labels.push(trimmed);
  }
}

if (labels.length === 0) process.exit(0);

const offending = labels.filter((label) => LIFECYCLE.has(label));
if (offending.length === 0) process.exit(0);

const reason =
  `Refusing to set pipeline/triage label(s) [${offending.join(", ")}] via gh issue edit. ` +
  `These labels are owned by the .github/workflows App automations ` +
  `(triage.yml / unblock.yml / implement.yml); setting them by hand races the bot. ` +
  `Omit the label and let triage re-evaluate. See docs/agents/triage-labels.md.`;

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
