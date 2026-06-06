# Contributing

## Opening issues and pull requests

Use the GitHub issue forms for bug reports and feature or enhancement requests. Blank issues are disabled so reports include the expected behavior or motivation, actual behavior or desired behavior, relevant **Codec variant**, affected surface, and enough context for triage.

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
- **Monotonicity inside `generate()`.** A stable intra-ms sort would force a breaking change to `Options.rng`. If you need this, design it as a separate opt-in API (e.g. `createMonotonicId`) and propose it in an issue first.
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
pnpm build             # tsdown
```

Run `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm fmt:check`, and `pnpm depcruise` before opening a PR.

## Style

- **Don't mock the clock or RNG.** Inject them via `Options` (`now`, `rng`) — see the existing tests for how.
- **New exports → update the API surface section in [`README.md`](./README.md).**
- **New domain concept → add a glossary entry to [`CONTEXT.md`](./CONTEXT.md)**, including any synonyms you want future contributors to avoid.
- **New design decision that's hard to reverse, surprising without context, and the result of a real trade-off → add a new ADR** under `docs/adr/`, numbered sequentially.
- **Commit subjects:** `<scope>: <what changed>` (e.g. `id: tighten is() to canonical-only`).

## Tests

- Add a test for any new public behaviour.
- Add boundary tests for any new numeric input (compare with `extracts ms at the 48-bit boundary` and friends in `id.test.ts`).
- Use deterministic `rng` and `now` in tests that assert on the encoded form — never snapshot a fully-random ID.
