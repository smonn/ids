// Pure aggregation over resolved blocker states for triage.yml and unblock.yml.
//
// This module contains ZERO I/O. The workflows resolve each declared blocker's state
// via `gh issue view` (which works for PR numbers too) and hand the collected
// `{ number, state }` pairs to this function, which decides whether the dependency set
// is satisfied and formats the open-blocker list for the "blocked" comment. Unlike
// review-scope.mjs (a pre-checkout twin that cannot be invoked), these steps run AFTER
// checkout, so the workflows import and CALL this code directly — it is the single
// source of truth, not a mirror.
//
// Resolution rule (matches the bash `case "$state" in CLOSED | MERGED) ;; *) … ;;`):
// a blocker is resolved when CLOSED (a closed issue or PR) or MERGED (a merged PR
// reports MERGED, not CLOSED). Every other state — OPEN, UNKNOWN, anything — counts as
// still open, so an unresolvable lookup parks the issue rather than silently freeing it.

import { fileURLToPath } from "node:url";

const RESOLVED_STATES = new Set(["CLOSED", "MERGED"]);

/**
 * Classify a set of resolved blockers.
 *
 * @param {Array<{ number: number | string, state: string }>} [blockers]
 * @returns {{ anyOpen: boolean, open: Array<number | string>, resolved: Array<number | string>, openList: string }}
 */
export function blockerStatus(blockers = []) {
  const open = [];
  const resolved = [];
  for (const { number, state } of blockers) {
    if (RESOLVED_STATES.has(state)) {
      resolved.push(number);
    } else {
      open.push(number);
    }
  }
  return {
    anyOpen: open.length > 0,
    open,
    resolved,
    openList: open.map((n) => `#${n}`).join(", "),
  };
}

// CLI: read `{ "blockers": [{ "number": N, "state": "STATE" }, ...] }` on STDIN and
// write the classification JSON on STDOUT. triage.yml / unblock.yml run the `gh issue
// view` I/O, pipe the collected pairs here, and read the result with jq.
async function main() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const input = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  process.stdout.write(JSON.stringify(blockerStatus(input.blockers ?? [])));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
