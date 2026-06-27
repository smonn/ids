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

import {
  areasFromIssueBody,
  codecsFromIssueBody,
  reconcileLabels,
  typeFromIssueLabels,
} from "./label-classifier.mjs";

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

const raw = await readStdin();
const input = JSON.parse(raw || "{}");

const body = input.body ?? "";
const labels = input.labels ?? [];
const current = input.current ?? [];

const desired = [];

const type = typeFromIssueLabels(labels);
if (type) desired.push(type);

desired.push(...codecsFromIssueBody(body));
desired.push(...areasFromIssueBody(body));

const managedPrefixes = ["codec:", "area:"];
if (type) managedPrefixes.push("type:");

const plan = reconcileLabels(current, desired, managedPrefixes);
process.stdout.write(JSON.stringify(plan));
