---
name: implement
description: "Implement a piece of work based on a PRD or set of issues."
disable-model-invocation: true
---

Implement the work described by the user in the PRD or issues.

Use /tdd where possible, at pre-agreed seams.

Run typechecking regularly, single test files regularly, and the full test suite once at the end.

Update the docs that ship with the behavior, in the same PR. The `website/src/content/docs/` Starlight site mirrors the source slices almost 1:1 and does **not** regenerate on its own (only the TypeDoc API reference does): `src/adapters/<name>.ts` → `adapters/<name>.md`, `src/codecs/<name>/` → `codecs/<name>.md`, `src/cli/` → `cli.md`, `src/error.ts` → `errors.md`. If you change behavior in one of those slices, update the matching page (plus `README.md` / `CONTEXT.md` / an ADR where `CONTRIBUTING.md` calls for it). See `AGENTS.md` for the full doc-update rules.

Once done, use /review to review the work.

Commit your work to the current branch.
