// Glue for the PR descriptive auto-labeller (Phase 1, ADR-0029). Reads a JSON
// document on STDIN — gathered by pr-labels.yml from git/gh — and writes the
// label add/remove plan as JSON on STDOUT. All classification lives in the pure,
// unit-tested label-classifier.mjs; this file only wires inputs to outputs so the
// workflow can apply the result with `gh pr edit`.
//
// STDIN shape:
//   {
//     "title":      "<PR title>",
//     "current":    ["<existing label>", ...],
//     "files":      ["<changed path>", ...],
//     "numstat":    "<git diff --numstat output>",
//     "changesets": ["<.changeset/*.md contents>", ...]
//   }
//
// STDOUT shape: { "add": ["..."], "remove": ["..."] }

import {
  areasFromPaths,
  bumpFromChangeset,
  changesetFromBumps,
  churnFromNumstat,
  codecsFromPaths,
  reconcileLabels,
  sizeFromChurn,
  typeFromTitle,
} from "./label-classifier.mjs";

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

const raw = await readStdin();
const input = JSON.parse(raw || "{}");

const title = input.title ?? "";
const current = input.current ?? [];
const files = input.files ?? [];
const numstat = input.numstat ?? "";
const changesets = input.changesets ?? [];

const desired = [];

// type: only when the title is a valid Conventional-Commit subject. Otherwise it
// is left out of the managed set so a non-CC PR (e.g. the Changesets release PR)
// keeps whatever type: it has rather than having it stripped.
const type = typeFromTitle(title);
if (type) desired.push(type);

desired.push(sizeFromChurn(churnFromNumstat(numstat)));
desired.push(...codecsFromPaths(files));
desired.push(...areasFromPaths(files));
desired.push(changesetFromBumps(changesets.map(bumpFromChangeset).filter(Boolean)));

const managedPrefixes = ["size:", "codec:", "area:", "changeset:"];
if (type) managedPrefixes.push("type:");

const plan = reconcileLabels(current, desired, managedPrefixes);
process.stdout.write(JSON.stringify(plan));
