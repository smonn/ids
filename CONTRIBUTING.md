# Contributing

## Opening issues and pull requests

Use the GitHub issue forms for bug reports and feature or enhancement requests. Blank issues are disabled so reports include the expected behavior or motivation, actual behavior or desired behavior, relevant **Codec variant**, affected surface, and enough context for triage.

**Right-size the work before filing.** Break a change into the smallest independently-shippable units along its natural seams, and file those rather than one large issue. This matters most for `ready-for-agent` work: an oversized issue — one that bundles, say, a new type plus its adoption across many call sites plus docs plus tests — can exhaust the implementing agent's turn budget before it ever opens a PR. Prefer a short chain of small issues — an additive foundation first, then the change that depends on it — filing the foundation as unblocked and giving each dependent a `Blocked by #N` section. Give every split issue an explicit **Out of scope** fence that names the sibling issue owning the deferred work (e.g. "the error-code table ships with the conversion in #149"), so an implementer can't pull a follow-up's work forward.

Maintainers apply triage labels after reading the issue:

- `needs-triage` means a maintainer still needs to evaluate the issue.
- `needs-info` means the reporter needs to provide more information.
- `ready-for-agent` means the issue is fully specified and ready for an AFK agent.
- `ready-for-human` means the issue requires human implementation.
- `wontfix` means the issue will not be actioned.

PRs should link the relevant issue unless they are small bug fixes or docs tweaks. Use the PR template to record the test plan and any impact on the public API, wire format, CLI behavior, docs, domain vocabulary, or ADRs.

## Before you open a PR

- **Open or comment on a [GitHub issue](https://github.com/smonn/ids/issues) first** if your change is more than a small bug fix or doc tweak. Especially for anything that touches the wire format, the public API, or the validation contract — these have been deliberated and "I built it, please merge" PRs may not be accepted.
- **Read [`CONTEXT.md`](./CONTEXT.md).** Use its vocabulary in code, commit messages, and PR descriptions; avoid the synonyms listed under each `_Avoid_:` line.
- **Skim the [ADRs](./docs/adr/).** They record the constraints your change has to live with.

## Closed design questions

These were considered and rejected for specific reasons. If you have a genuinely new argument, raise it as an issue with that argument explicit — don't ship a PR that silently reopens the decision.

- **Brand width or charset.** Fixed at three lowercase a–z chars. Changing it invalidates every previously-issued ID. See [ADR-0001](./docs/adr/0001-brand-format.md).
- **Payload byte split, byte order, precision, or epoch.** Fixed at 6 bytes big-endian ms Unix timestamp + 10 random bytes. Same wire-format constraint. See [ADR-0002](./docs/adr/0002-payload-layout.md).
- **Lenient `is()`.** `is()` is canonical-only by design; the lenient path is `safeParse()`. Restoring lenient `is()` would re-open the footgun ADR-0003 closed. See [ADR-0003](./docs/adr/0003-canonical-strict-is.md).
- **Monotonicity inside `generate()`.** A stable intra-ms sort would force a breaking change to `TimestampOptions.rng`. If you need this, design it as a separate opt-in API (e.g. `createMonotonicId`) and propose it in an issue first.
- **Custom epoch.** 48 bits of ms gives ~8919 years of headroom from 1970; there's no bit-budget motivation to rebase. A custom epoch would turn time into a magic number every downstream consumer would have to remember. See [ADR-0002](./docs/adr/0002-payload-layout.md).

## Setup

```bash
pnpm install
```

Requires Node ≥ 24 and pnpm.

## Dev loop

```bash
pnpm test              # vitest run
pnpm test:watch        # vitest in watch mode
pnpm test:coverage     # vitest with v8 coverage
pnpm typecheck         # tsc --noEmit
pnpm lint              # oxlint
pnpm fmt:check         # oxfmt --check
pnpm depcruise         # dependency layer rules (ADR-0008)
pnpm knip              # unused exports and dependencies
pnpm build             # tsdown
```

Run `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm fmt:check`, `pnpm depcruise`, and `pnpm knip` before opening a PR.

## Style

- **Don't mock the clock or RNG.** Inject them via `TimestampOptions` (`now`, `rng`) — see the existing tests for how.
- **New exports → update the API surface section in [`README.md`](./README.md).**
- **New ORM adapter → also update the `IdCodec` and `Error code` enumeration entries in [`CONTEXT.md`](./CONTEXT.md)** to include the new adapter subpath (IdCodec entry) and its read adapter name (Error code entry).
- **Document only shipped behavior.** A PR's `README` / `CONTEXT.md` / ADR edits describe behavior implemented in that same PR — never pre-document a sibling issue's work or an unmerged design. Adding a new export to the API-surface list is in scope; documenting how it _behaves_ waits for the PR that ships that behavior.
- **New domain concept → add a glossary entry to [`CONTEXT.md`](./CONTEXT.md)**, including any synonyms you want future contributors to avoid.
- **New design decision that's hard to reverse, surprising without context, and the result of a real trade-off → add a new ADR** under `docs/adr/`, numbered sequentially. See [`docs/adr/ADR-FORMAT.md`](./docs/adr/ADR-FORMAT.md) for ADR authoring conventions, including how to annotate stale claims in shipped ADRs with correction notes.
- **PR titles follow [Conventional Commits](https://www.conventionalcommits.org/) and are CI-enforced:** `<type>(<optional scope>): <what changed>` (e.g. `feat(id): tighten is() to canonical-only`). Allowed types: `feat`, `fix`, `docs`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`; the optional scope names a code area (`id`, `kysely`, `bench`, …). PRs are squash-merged, so the **PR title — not your individual commits — becomes the commit subject on `main`.** Aim for ≤ 72 characters; GitHub appends ` (#123)` on merge.
- **Commit subjects** should use the same Conventional Commits format as a courtesy to reviewers reading the commit-by-commit view, but they are **not enforced** — squash-merge discards them, so don't rewrite already-pushed history just to reformat a subject.

## Tests

- Add a test for any new public behaviour.
- Add boundary tests for any new numeric input (compare with `extracts ms at the 48-bit boundary` and friends in `src/codecs/timestamp/index.test.ts`).
- Use deterministic `rng` and `now` in tests that assert on the encoded form — never snapshot a fully-random ID.
