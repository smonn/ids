// Glue for the issue descriptive auto-labeller (Phase 1, ADR-0029). Reads a JSON
// document on STDIN — gathered by issue-labels.yml from gh — and writes the label
// add/remove plan as JSON on STDOUT. Issues get type: (mapped from the template's
// bug/enhancement label) and the dropdown-sourced codec:/area: labels; size: and
// changeset: are PR-only. All classification lives in label-classifier.mjs.
//
// STDIN shape:
//   {
//     "body":    "<rendered issue body>",
//     "labels":  ["<template label such as bug/enhancement>", ...],
//     "current": ["<existing label>", ...]
//   }
//
// STDOUT shape: { "add": ["..."], "remove": ["..."] }

import { planIssueDescriptiveLabels } from "./label-classifier.mjs";

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

const raw = await readStdin();
const input = JSON.parse(raw || "{}");

const plan = planIssueDescriptiveLabels({
  body: input.body ?? "",
  // `labels` is both the source of the bug/enhancement → type: mapping and the
  // current-label set to reconcile against (issue-labels.yml passes the same array).
  labels: input.labels ?? [],
  current: input.current ?? [],
});
process.stdout.write(JSON.stringify(plan));
