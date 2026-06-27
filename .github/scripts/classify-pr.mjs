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

import { planPrLabels } from "./label-classifier.mjs";

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

const raw = await readStdin();
const input = JSON.parse(raw || "{}");

const plan = planPrLabels({
  title: input.title ?? "",
  current: input.current ?? [],
  files: input.files ?? [],
  numstat: input.numstat ?? "",
  changesets: input.changesets ?? [],
});
process.stdout.write(JSON.stringify(plan));
