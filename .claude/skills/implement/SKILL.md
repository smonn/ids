---
name: implement
description: "Implement a piece of work based on a spec or set of tickets."
disable-model-invocation: true
---

Implement the work described by the user in the spec or tickets.

Build it test-first with `/tdd` at the pre-agreed seams. That loop is red → green only: write the failing test, then just enough code to pass it. Don't refactor inside the loop — that's the review stage below.

Run typechecking regularly, single test files regularly, and the full test suite once at the end.

Update the docs that ship with the behavior, in the same PR. The `website/src/content/docs/` Starlight site mirrors the source slices almost 1:1 and does **not** regenerate on its own (only the TypeDoc API reference does): `src/adapters/<name>.ts` → `adapters/<name>.md`, `src/codecs/<name>/` → `codecs/<name>.md`, `src/cli/` → `cli.md`, `src/error.ts` → `errors.md`. If you change behavior in one of those slices, update the matching page (plus `README.md` / `CONTEXT.md` / an ADR where `CONTRIBUTING.md` calls for it). See `AGENTS.md` for the full doc-update rules.

Once the code is green, run `/code-review` to fix issues and do the refactoring the `/tdd` loop deferred. Then use `/review` to check the work against the spec and repo standards.

Commit your work to the current branch.
