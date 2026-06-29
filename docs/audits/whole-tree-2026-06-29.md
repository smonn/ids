# Audit — whole source tree (2026-06-29)

Point-in-time snapshot. **Non-authoritative**: superseded once issues are filed. No GitHub issue numbers are invented here so it cannot rot against the tracker.

**Scope:** whole `src/` tree (plus `test/`, `spec/`, docs/website for the relevant dimensions). **Method:** ten parallel dimension reviewers, each gated against the decided digest (every terminal-status ADR + the SPEC/CONTEXT closed items). Findings that a digest line or ADR settles were dropped or tagged `closed:ADR-N` and do not appear as Open below — see the appendix.

The codebase is in strong shape: byte math is correct on every edge input traced, crypto primitives match their ADRs, the tree is already aggressively de-duplicated, and the architecture matches the by-feature-slice layering. No Critical findings, and no actionable High/Medium defects in the trust-critical crypto core. The Open findings are quality, test-seam, doc-accuracy, and lint-enforcement items.

## Open findings (ranked)

### High

1. **Opaque guide documents the wrong error type for `generateAt`** `website/src/content/docs/codecs/opaque.md:77` Doc says invalid/overflow/NaN dates throw a plain `Error` "(not an `IdsError`)". Source path `opaque/layout.ts → wire/timestamp-bytes.ts:12-15` throws `IdsError` with `code: "invalid_timestamp"` (the central errors page documents this correctly). A user following the guide catches the wrong branch and never matches the code. **Disposition: file (ready-agent, doc fix).**

2. **`LayoutOps`/`exampleWireId` is a one-member contract whose member is a constant** `src/types.ts:75-78` + 6× `src/codecs/*/layout.ts` All six layouts implement `exampleWireId: () => schemaExampleId(prefix)` identically, and each constructor already holds `prefix`. The method, the `LayoutOps` type, six return-type annotations, and a type-test carry zero per-codec information; a new codec must re-implement a constant. Direction: drop `exampleWireId`/`LayoutOps`, call `wire.toJsonSchema(brand, schemaExampleId(prefix))` directly in each constructor. **Disposition: file (low-priority cleanup). Verify the "all six identical" claim in the acceptance criteria before deleting.**

### Medium

3. **`keygen` ignores the injectable `rng` seam, so its output is untestable** `src/cli/commands/keygen.ts:39` Calls `crypto.getRandomValues` directly instead of `opts.rng` (which `RunOpts` plumbs everywhere else). Tests can only assert format/length, never a known-answer key; a regression emitting a constant/truncated key would pass. Direction: read `opts.rng ?? crypto.getRandomValues`; add a KAT test with an injected fill rng. **Disposition: file (ready-agent).**

4. **CLI generate path is never injected with `now`/`rng` → no known-answer test** `src/cli/codec-options.ts:8-9` (seam) / `src/cli/router.test.ts` The seams exist but no router/edge test passes them; CLI generate is only asserted by regex shape and exit codes, so the whole CLI encode wiring could produce wrong-but-well-formed IDs undetected. Direction: one CLI generate test injecting fixed `now`+`rng`, asserting the exact wire string already pinned in the library golden vectors. **Disposition: file (ready-agent). Chain after #3 — both touch `cli/router.test.ts`.**

5. **`usageCodes` set is `string`-typed, not tied to `IdsErrorCode`** `src/cli/verbs.ts:31-40` A newly added (minor-additive) error code is not flagged by the compiler and silently defaults to the `runtime` (exit 1) bucket — possibly the wrong CLI exit code. Direction: type as `ReadonlySet<IdsErrorCode>` or build from an exhaustive `Record<IdsErrorCode, "usage"|"runtime">` so a missing code is a compile error. **Disposition: file (ready-agent).**

6. **depcruise enforcement gaps for leaf primitives** `.dependency-cruiser.cjs` (+ fixtures + `src/depcruise-rules.test.ts`) The stated leaf invariants are not fully covered, so future drift passes CI:
   - `rng.ts` (the CSPRNG primitive) has **no rule at all** — unlike every sibling leaf it appears in zero from/to clauses. An adapter/CLI/wire module could import it, or it could import upward, uncaught.
   - `_kernel/registry.ts` is omitted from the `leaves-no-upward` guard despite identical leaf status to `brand.ts` (ADR-0021 treats it as contained).
   - `wire/uuid.ts` has no `*-imports-allowlist` rule, unlike its wire peers. Direction: add an `rng` restricted-consumers + no-upward pair, add `registry.ts` to `leaves-no-upward`, add a `wire-uuid-imports-allowlist`. **Disposition: file (ready-agent, one issue — same file set).**

### Low

7. **`safeParse` allocates a lowercased copy of pre-validation input** `src/wire/parse.ts:20-28` On the lenient fallback (any non-canonical input), `value.toLowerCase()` allocates and scans before the anchored bounded regex would reject; a hostile multi-MB string through an HTTP adapter amplifies CPU/allocations per request. The regex itself is backtracking-safe. Direction: early length cap (`value.length > prefix.length + payloadBase32Length`) before normalizing — the canonical form is fixed-length. **Disposition: file (low-priority).**

8. **kysely `transformResult` rebuilds every row via `Object.entries`** `src/adapters/kysely.ts:188-196` O(rows × columns) allocation per result set even when only 1–2 columns are IDs (the no-mapped-column guard mitigates the common case). Direction: precompute matched column names once from `firstRow`, then copy only those keys. **Disposition: file (low-priority).**

9. **`package.json` omits `"sideEffects": false`** `package.json` 16 ESM subpath bundles intended to be tree-shakeable, but bundlers must assume side effects, undercutting the subpath-export rationale (ADR-0005). Modules are side-effect-free at import (registry mutation is inside called functions; the only top-level work is empty `new Set()` allocations). Direction: add `"sideEffects": false` after confirming no top-level effects. **Disposition: file (ready-agent).**

10. **CLI flag parsers use three different result conventions** `src/cli/flags.ts:3-42` (+ `src/cli/verbs.ts` unwrap sites) `parseCount` returns `number | string`, `parseKind` returns `value | string | undefined` with an `isKindError` guard, `parseNs` returns a `{ok}` union or `undefined` with an `isNsError` wrapper (which is just `!result.ok`). Each forces a different unwrap dance. Direction: pick one convention (e.g. `T | CliError`) for all three; removes the `parseCountValue`/`isKindError`/`isNsError`/ `parseNsValue` adapters. **Disposition: file (low-priority).**

11. **`rng.ts` `defaultRng`/`fastTenByteRng` are themselves untested** `src/codecs/_kernel/rng.ts:2,58` / `rng.test.ts` `rng.test.ts` only covers the pure `harvestUUIDBytes` helper. Direction: assert each fills the full target length (a wrong subarray bound in `fastTenByteRng` would slip through) and varies across calls. **Disposition: file (low-priority).**

12. **signed/wrapped layout magic literals & name reuse** (maintainability cluster)
    - `src/codecs/signed/layout.ts:18-19` — constant `11` bound to two always-equal names (`tagOffset`, `signedContentByteLength`); derive one from the other.
    - `src/codecs/signed/layout.ts:12` vs `timestamp`/`reverse` `layout.ts` — `randomByteLength` names `5` in signed but `10` in the timestamp family; a cross-reading maintainer is misled. Rename to `signedRandomByteLength`.
    - `src/codecs/wrapped/layout.ts:123,126,130` + `bytes.ts:53` — the len32 width `4` is a scattered bare literal; name a `len32ByteLength = 4` constant. **Disposition: file (low-priority). Group signed items + wrapped item — note the wrapped item also touches `bytes.ts`, so keep it disjoint from any other `bytes.ts` work.**

13. **Sibling option-defaulting diverges between timestamp and reverse** `src/codecs/reverse/index.ts:132-133` vs `src/codecs/timestamp/index.ts:96-127` Timestamp uses a `defaultTimestampOptions` + `satisfies` scaffold; reverse inlines `opts.now ?? Date.now`. Below the ADR-0014 de-dup warrant, flagged as structural inconsistency only. Direction: pick one defaulting idiom for both. **Disposition: file (low-priority).**

14. **Stale "eleven codes" count in ADR text vs the twelve-member union** `docs/adr/0017-*.md`, `docs/adr/0011-*.md` correction note The `IdsErrorCode` union and README correctly say twelve; the ADR prose says eleven. Direction: correction note bumping the count. **Disposition: file (low-priority, doc one-liner — batchable).**

15. **`src/index.ts` root-only `timestamp` export is undocumented asymmetry** `src/index.ts:3` vs `package.json` exports `createTimestampId` is root-exported while the other five codecs are subpath-only (ADR-0005). Deliberate "default codec" choice, but a future reader could "fix" it. Direction: one-line note in ADR-0005 documenting the root-default exception; no code change. **Disposition: file (low-priority, doc one-liner — batchable).**

## Dropped (with reason)

- **Hand-rolled `timingSafeEqual` instead of `node:crypto`** — `src/codecs/_kernel/crypto.ts:11-16`. The loop is branchless (`diff |= a[i]^b[i]`, single return). The library targets **Web Crypto** (`crypto.subtle`, `getRandomValues`, `CryptoKey`) for cross-runtime portability; Web Crypto has no `timingSafeEqual`, and importing `node:crypto` would break Deno/browser/worker runtimes. The hand-rolled portable compare is the correct, intentional choice. **Drop (portability posture).**
- **CLI unbounded stdin / `IDS_KEY` read** — `src/cli/key.ts:62`, `src/cli/verbs.ts:362-371`. Operator-controlled, CLI-local; impact is self-DoS only. **Drop (no untrusted boundary).**
- **opaque HKDF guard test asserts only inequality** — `src/codecs/opaque/index.test.ts:55-66`. The adjacent golden vector (`index.test.ts:342`) is the real anchor; the inequality test is a weak but harmless companion. **Drop (covered by golden vector).**
- **CHANGELOG stale `--from-uuid`/`--key-format` flag** — `CHANGELOG.md:14`. Changesets are historical records of what shipped; rewriting them is not user-actionable. **Drop (historical record).**

## Already decided — not raised (gate proof)

These were surfaced by reviewers and correctly suppressed by the gate:

- Opaque AES-CBC zero-IV strip-and-reconstruct; wrong-key never throws, no padding oracle → `closed:ADR-0004` / `ADR-0013`.
- Decode-then-verify ordering in wrapped unwrap (safe — no padding oracle) → `closed:ADR-0009`.
- Truncated-MAC tail widths (signed 40-bit, wrapped 64-bit) → `closed:ADR-0012` / `ADR-0009`.
- HKDF empty salt / separation by `info` label only → `closed:ADR-0019` / `ADR-0027`.
- No raw-secret retention on key handles → `closed:ADR-0016`.
- Ordered-keyring early-return trial timing → `closed:ADR-0009` / `ADR-0012`.
- 16-byte / 128-bit / 26-char payload width; no version marker → `closed:ADR-0015` / `ADR-0007`.
- `fromUUID` version-agnostic, accepts non-time-ordered UUIDs → `closed:ADR-0024`.
- Deterministic wrapped/digest equality leakage → `closed:CONTEXT` / `ADR-0009`.
- Six codec `index.ts` / four keyed `key.ts` / CLI codec adapters / ORM + transport adapters "duplication" → `closed:ADR-0014` / `ADR-0020` (already factored or intentional mirroring below the de-dup warrant).
- Codec `index.ts` → `wireMethods` binding, CLI router/verbs layering, `adapter-types` interfaces, `ValidBrand` param-intersection → `closed:ADR-0018` / `ADR-0032` / `ADR-0020` / `ADR-0022` (inherent, not accidental, complexity).
- Keyed-codec conformance vectors absent from `spec/vectors.json` → `closed:ADR-0025` (deferred to v2); vectors never regenerated → `closed:ADR-0026`.
- SPEC "descriptive not normative", keyed-codec construction deferred → `closed:ADR-0025`.
- Subpath-only codec exports, async/sync key split, brand-registry posture, adapter error model → `closed:ADR-0005` / `ADR-0006` / `ADR-0021` / `ADR-0020`.
