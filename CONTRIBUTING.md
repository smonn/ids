# Contributing

## Opening issues and pull requests

Use the GitHub issue forms for bug reports and feature or enhancement requests. Blank issues are disabled so reports include the expected behavior or motivation, actual behavior or desired behavior, relevant **Codec variant**, affected surface, and enough context for triage.

**Right-size the work before filing.** Break a change into the smallest independently-shippable units along its natural seams, and file those rather than one large issue. This matters most for `ready-for-agent` work: an oversized issue — one that bundles, say, a new type plus its adoption across many call sites plus docs plus tests — can exhaust the implementing agent's turn budget before it ever opens a PR. Prefer a short chain of small issues — an additive foundation first, then the change that depends on it — filing the foundation as unblocked and giving each dependent a `Blocked by #N` section. Give every split issue an explicit **Out of scope** fence that names the sibling issue owning the deferred work (e.g. "the error-code table ships with the conversion in #149"), so an implementer can't pull a follow-up's work forward.

**Scope findings by class, not by instance.** When an issue reports an instance of a repeating pattern — an unredacted echo site, a duplicated literal, a stale claim that also lives in a sibling file — define the class in the issue ("every site where a raw argv token reaches stderr"), list the known sites as a starting point only, and write the acceptance criteria to demand a sweep: search for the whole class and either fix every hit or list the deliberately-skipped ones in the PR body. Site-enumerated issues are the most common source of audit follow-ups (see the `docs/audits/` snapshots): the enumerated sites get fixed and the unenumerated siblings surface next round.

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
- **Payload byte split, byte order, precision, or epoch.** Fixed at 6 bytes big-endian ms Unix timestamp + 80 random bits (10 bytes). Same wire-format constraint. See [ADR-0002](./docs/adr/0002-payload-layout.md).
- **Lenient `is()`.** `is()` is canonical-only by design; the lenient path is `safeParse()`. Restoring lenient `is()` would re-open the footgun ADR-0003 closed. See [ADR-0003](./docs/adr/0003-canonical-strict-is.md).
- **Monotonicity inside `generate()`.** A stable intra-ms sort would force a breaking change to `TimestampOptions.rng`. If you need this, design it as a separate opt-in API (e.g. `createMonotonicId`) and propose it in an issue first.
- **Custom epoch.** 48 bits of ms gives ~8919 years of headroom from 1970; there's no bit-budget motivation to rebase. A custom epoch would turn time into a magic number every downstream consumer would have to remember. See [ADR-0002](./docs/adr/0002-payload-layout.md).
- **Opaque key behavior.** The Opaque Timestamp codec is unauthenticated AES-CBC (strip-and-reconstruct); wrong-key decrypt produces plausible garbage, not an error. Rotation is forward-only and caller-tracked — there is no library-trialled keyring on this codec. See [ADR-0004](./docs/adr/0004-aes-cbc-strip-trick.md), [ADR-0006](./docs/adr/0006-async-keyed-codec-contract.md), and [ADR-0013](./docs/adr/0013-opaque-key-rotation.md).
- **Wire-indistinguishable codec variants.** All codec variants produce the same wire shape (`<brand>_` + 26 Crockford base32 chars); there is no per-codec marker on the wire. Codec choice is a per-brand commitment at construction time, not something that can be inferred from an ID. See [ADR-0007](./docs/adr/0007-wire-indistinguishable-codec-variants.md).

## Setup

```bash
pnpm install
```

Requires Node ≥ 22 and pnpm.

## Dev loop

```bash
pnpm test              # vitest run
pnpm test:watch        # vitest in watch mode
pnpm test:coverage     # vitest with v8 coverage
pnpm typecheck         # tsc --noEmit
pnpm lint              # oxlint
pnpm fmt:check         # oxfmt --check
pnpm depcruise         # dependency layer rules (ADR-0018)
pnpm knip              # unused exports and dependencies
pnpm mutation          # Stryker mutation testing (slow; CI runs it weekly)
pnpm build             # tsdown
```

Run `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm fmt:check`, `pnpm depcruise`, and `pnpm knip` before opening a PR. A Husky pre-push hook runs the fast static tier (`label-trigger-lint`, `adr-front-matter-lint`, `knip`, `depcruise`, `lint`, `fmt:check`, `typecheck`, `build`) automatically on `git push`; use `--no-verify` to bypass in an emergency.

## Style

- **Soft-wrap Markdown prose.** Write one source line per paragraph with no hard line breaks mid-paragraph — let the renderer wrap. This is enforced by oxfmt (`proseWrap: "never"` in `.oxfmtrc.json`); `pnpm fmt:check` catches drift and `pnpm fmt` reflows. The Starlight site under `website/` is exempt because oxfmt corrupts its `:::` directives.
- **Don't mock the clock or RNG.** Inject them via `TimestampOptions` (`now`, `rng`) — see the existing tests for how.
- **New exports → update the API surface section in [`README.md`](./README.md).**
- **Error types live only in `@smonn/ids`.** `IdsError`, `isIdsError`, and `IdsErrorCode` are not re-exported from any codec subpath (`@smonn/ids/reverse`, `/signed`, `/opaque`, `/wrapped`, `/digest`). Import them from the main entry point: `import { IdsError, isIdsError } from "@smonn/ids"`.
- **Behavior change in a documented slice → update the matching [`website/`](./website/src/content/docs/) page in the same PR.** The Starlight site mirrors the source almost 1:1: `src/adapters/<name>.ts` ↔ `adapters/<name>.md`, `src/codecs/<name>/` ↔ `codecs/<name>.md`, `src/cli/` ↔ `cli.md`, `src/error.ts` ↔ `errors.md`. The TypeDoc API reference regenerates itself at build time, but these hand-written narrative pages do not — they drift unless you touch them. The `docs-coverage` check **fails the PR** when a mapped source file changed but its page didn't; if the source change genuinely doesn't affect the page (e.g. an internal refactor behind an unchanged contract), add a line starting `No docs update needed:` with the reason to the PR body and the check passes with a notice. The gate runs on fork PRs too; forks just get the gap report in the check's job summary instead of a PR comment (the comment needs write permissions their token doesn't have).
- **User-visible change → add a changeset** (`.changeset/<slug>.md`): public API, CLI behavior, adapter behavior, anything shipped in the npm tarball (including `spec/vectors.json`), or a release-note-worthy fix. Use `minor` for additive API, `patch` for fixes. The `changeset-check` CI gate **fails `feat`/`fix`/`perf` PRs** that touch `src/`, `bin/`, or `spec/` without one; if the change genuinely isn't release-note-worthy, add a line starting `No changeset needed:` with the reason to the PR body. The gate keys on the title type, so `docs:`/`test:`/`ci:`/`chore:`-titled PRs never trip it — but a `fix:`-titled PR that only touches tests under `src/` still does, and wants the waiver line rather than a changeset. Both waivers (`No changeset needed:` and `No docs update needed:`) must appear as **PR body text** — a `changeset:none` label does not satisfy either gate.
- **New ORM adapter → also update the `IdCodec` and `Error code` enumeration entries in [`CONTEXT.md`](./CONTEXT.md)** to include the new adapter subpath (IdCodec entry) and its read adapter name (Error code entry).
- **Document only shipped behavior.** A PR's `README` / `CONTEXT.md` / ADR / `website/` edits describe behavior implemented in that same PR — never pre-document a sibling issue's work or an unmerged design. Adding a new export to the API-surface list is in scope; documenting how it _behaves_ waits for the PR that ships that behavior.
- **New domain concept → add a glossary entry to [`CONTEXT.md`](./CONTEXT.md)**, including any synonyms you want future contributors to avoid.
- **New design decision that's hard to reverse, surprising without context, and the result of a real trade-off → add a new ADR** under `docs/adr/`, numbered sequentially. See [`docs/adr/ADR-FORMAT.md`](./docs/adr/ADR-FORMAT.md) for ADR authoring conventions, including how to annotate stale claims in shipped ADRs with correction notes.
- **devDependency version ranges follow a two-tier convention.** The CI-gate toolchain — anything whose output the gate asserts on (`typescript`, `vitest`/`@vitest/coverage-v8`, `oxlint`, `oxfmt`, `tsdown`, `dependency-cruiser`, `knip`, `@arethetypeswrong/cli`, `publint`, `@changesets/cli`, `@cyclonedx/cdxgen`, `@types/node`, `mitata`, `yaml`) — is pinned to **exact versions**, because these tools can change behavior within a semver range (TypeScript minors introduce new type errors; a formatter or linter update can fail `fmt:check`/`lint` repo-wide) and gate behavior should only change via an explicit, reviewable version-bump PR. Everything else — the adapter/peer-mirror devDependencies (`drizzle-orm`, `kysely`, `hono`, …) and low-stakes utilities (`husky`, `lint-staged`, `fast-check`, …) — uses **caret ranges**. Never use an unbounded `>=` range in devDependencies; that style is reserved for `peerDependencies` floors.
- **PR titles follow [Conventional Commits](https://www.conventionalcommits.org/) and are CI-enforced:** `<type>(<optional scope>): <what changed>` (e.g. `feat(id): tighten is() to canonical-only`). Allowed types: `feat`, `fix`, `docs`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`; the optional scope names a code area (`id`, `kysely`, `bench`, …). PRs are squash-merged, so the **PR title — not your individual commits — becomes the commit subject on `main`.** Aim for ≤ 72 characters; GitHub appends ` (#123)` on merge.
- **Commit subjects** should use the same Conventional Commits format as a courtesy to reviewers reading the commit-by-commit view, but they are **not enforced** — squash-merge discards them, so don't rewrite already-pushed history just to reformat a subject.

## Tests

- Add a test for any new public behaviour.
- Add boundary tests for any new numeric input (compare with `extracts ms at the 48-bit boundary` and friends in `src/codecs/timestamp/index.test.ts`). For a bitmask or flag set, cover **every** bit position with a single-bit case — a partial set passes a suite that a narrowed mask would also pass (the `0o077` permission mask shipped with read/write bits tested and the exec bits open).
- **A new or extracted shared helper gets its own direct unit test in the same PR.** Transitive coverage through callers is not enough: the callers' tests keep passing when a call site stops using the helper or passes it the wrong arguments (this is how `resolveVerifyFailure` shipped with its status-override behavior pinned in only one of four adapters).
- Use deterministic `rng` and `now` in tests that assert on the encoded form — never snapshot a fully-random ID.
- **Mutation testing runs weekly in CI** (`mutation.yml`, Stryker over `src/` + `bin/`) and is non-blocking: surviving mutants are triaged into issues, not red checks. When touching poorly-scored code, `pnpm mutation` with a narrowed scope (`npx stryker run --mutate "src/cli/flags.ts"`) gives a fast local signal.
