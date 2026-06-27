// Pure decision for address-review.yml's "guard against runaway auto-address loops" gate.
//
// This module contains ZERO I/O. address-review.yml resolves the PR's labels and the
// triggering sender, calls this function, and then performs every `gh pr edit/comment`
// the returned decision dictates. The gate step runs AFTER checkout and after the token
// mint, so the workflow imports and CALLS this code directly — it is the single source
// of truth, not a hand-synced twin like review-scope.mjs (whose pre-checkout step cannot
// invoke a repo file).
//
// The decision is a strict precedence ladder, mirroring the original inline bash:
//   1. needs-human present  → already escalated; do nothing.
//   2. automation:* present → a conflict-rebase mutex is in flight; defer, and clear a
//      stale pr:addressing-feedback a superseded run may have left behind.
//   3. human sender         → a fresh, human-driven request; reset the round counter and
//      proceed (the cap must not interfere with a human).
//   4. bot sender at cap    → the auto-loop ran maxRounds without converging; escalate.
//   5. bot sender below cap → advance the round counter and proceed.
//
// The round count lives in a single `auto-round:N` label (0 when absent). See
// .github/workflows/README.md and labels.yml for why a label, not a hidden comment.

import { fileURLToPath } from "node:url";

const ESCALATION_LABEL = "needs-human";
const MUTEX_PREFIX = "automation:";
const ADDRESSING_STATUS = "pr:addressing-feedback";
const ROUND_PREFIX = "auto-round:";

const decision = (over) => ({
  proceed: false,
  escalate: false,
  comment: null,
  labelsToAdd: [],
  labelsToRemove: [],
  ...over,
});

/**
 * The lone `auto-round:N` label and its parsed count (0 when none present).
 *
 * @param {string[]} labels
 * @returns {{ label: string | null, count: number }}
 */
function currentRound(labels) {
  const label = labels.find((l) => /^auto-round:\d+$/.test(l)) ?? null;
  return { label, count: label ? Number(label.slice(ROUND_PREFIX.length)) : 0 };
}

/**
 * Decide whether address-review should proceed, and which label mutations / comment the
 * deterministic bash steps must apply.
 *
 * @param {{
 *   labels?: string[],
 *   sender?: string,
 *   maxRounds?: number,
 *   botLogin?: string,
 * }} input
 * @returns {{
 *   proceed: boolean,
 *   reason: string,
 *   escalate: boolean,
 *   comment: string | null,
 *   labelsToAdd: string[],
 *   labelsToRemove: string[],
 * }}
 */
export function addressGate({ labels = [], sender, maxRounds, botLogin } = {}) {
  if (labels.includes(ESCALATION_LABEL)) {
    return decision({ reason: "already-escalated" });
  }
  if (labels.some((l) => l.startsWith(MUTEX_PREFIX))) {
    return decision({
      reason: "automation-mutex",
      labelsToRemove: labels.includes(ADDRESSING_STATUS) ? [ADDRESSING_STATUS] : [],
    });
  }
  const { label: roundLabel, count } = currentRound(labels);

  // A human applying do:address is a fresh, human-driven request the cap must not block.
  // Clear any stale round label left by a prior auto-loop and proceed.
  if (sender !== botLogin) {
    return decision({
      proceed: true,
      reason: "human-reset",
      labelsToRemove: roundLabel ? [roundLabel] : [],
    });
  }

  // Bot-driven round (review.yml re-applied do:address): enforce the cap, else advance.
  if (count >= maxRounds) {
    return decision({
      reason: "cap-reached",
      escalate: true,
      comment: `The automated review-fix loop ran ${count} round(s) without converging. Escalating for human review.`,
      labelsToAdd: [ESCALATION_LABEL],
      labelsToRemove: roundLabel ? [roundLabel] : [],
    });
  }
  const next = count + 1;
  return decision({
    proceed: true,
    reason: "advance",
    labelsToRemove: roundLabel ? [roundLabel] : [],
    labelsToAdd: [`${ROUND_PREFIX}${next}`],
  });
}

// CLI: read `{ "labels": [...], "sender": "...", "maxRounds": N, "botLogin": "..." }`
// on STDIN and write the decision JSON on STDOUT. address-review.yml resolves the labels
// and sender, pipes them here, then applies labelsToAdd/Remove and posts comment.
async function main() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const input = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  process.stdout.write(JSON.stringify(addressGate(input)));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
