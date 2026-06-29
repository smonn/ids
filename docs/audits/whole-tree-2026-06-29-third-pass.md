# Audit — whole source tree (2026-06-29, third pass)

Point-in-time snapshot. **Non-authoritative**: superseded by whatever issues are filed from it. This is the third whole-tree pass of the day: it runs after the morning audit (`whole-tree-2026-06-29.md`, #824 → findings #838–#851) and the follow-up (`whole-tree-2026-06-29-followup.md`, #852–#861). Those follow-up findings all shipped in commits #863–#872; this pass verified each as resolved and the gate suppressed every already-fixed item.

**Scope:** whole `src/` tree, plus `test/`, `spec/`, `docs/adr/`, and `website/` for the relevant dimensions. **Method:** ten parallel dimension reviewers, each gated against the decided digest (all 33 ADRs — Accepted by default, with ADR-0008 superseded by 0018, ADR-0015 Rejected, ADR-0028 superseded by 0033 — plus the SPEC/CONTEXT/CONTRIBUTING closed items). Findings a digest line or ADR settles were dropped or tagged `closed:ADR-N` and do not appear as Open below — see the appendix.

The trust-critical core is again clean. **Security (×2), Accuracy/correctness, Performance, and Testability returned zero open findings** on verified grounds: byte math was independently reimplemented and cross-checked against `spec/vectors.json`; the five HKDF labels are distinct; truncated-tag widths (signed 40-bit, wrapped 64-bit, digest 128-bit) match their ADRs; `timingSafeEqual` is branchless and all callers compare fixed-width tags; the untrusted-input surface funnels every external string through an anchored fixed-length regex before any byte reaches decode/crypto; and `vitest` enforces 100% coverage thresholds with comprehensive tamper/wrong-key/property suites. **No Critical, High, or Medium findings in code.** Every open finding is Low — documentation/ADR accuracy, a detached JSDoc block, a dead alias branch, and one marginal duplication.

## Open findings (ranked)

All Low. Grouped by the single file each one touches (disjoint sets → parallel-safe).

1. **README.md API surface claims the error trio is available "only from `@smonn/ids`"** `README.md:83` The line says `IdsError`/`isIdsError`/`IdsErrorCode` are "available **only** from `@smonn/ids` — not re-exported from any codec subpath." The codec-subpath half is true, but "only" is false: all six **adapter** subpaths re-export them (`src/adapters/{drizzle,kysely,mikro-orm,prisma,typeorm,graphql}.ts` each `export { IdsError, isIdsError, type IdsErrorCode }`), and `errors.md` (corrected in #852) documents exactly that set. A reader believes `import { isIdsError } from "@smonn/ids/prisma"` fails. **Direction:** reword to "not re-exported from any _codec_ subpath; the ORM and GraphQL adapter subpaths do re-export them." **Disposition: file (ready-agent, doc).**

2. **ADR-0011 + ADR-0018 prescribe a codec-subpath error re-export the code deliberately omits** `docs/adr/0011-coded-ids-error.md:122` (Consequences: "re-exported where a subpath throws them") and `docs/adr/0018-by-feature-codec-slices.md:56` (step-5 add-a-codec checklist: "Re-export `{ IdsError, isIdsError, type IdsErrorCode }` … in the codec subpath's `index.ts`"). The opaque/signed/wrapped/digest codecs all throw `IdsError` but none re-export the trio, and CONTRIBUTING's Style section explicitly forbids it ("Error types live only in `@smonn/ids` … not re-exported from any codec subpath"). The decision (codecs don't re-export; only adapters do) is settled — #852 corrected `errors.md` to match it — so the ADR prose is the stale side. A maintainer following the step-5 checklist adds a re-export CONTRIBUTING/knip reject. Same class as #854/#864. **Direction:** correct ADR-0011 Consequences and ADR-0018 step 5 to state codec subpaths do _not_ re-export the trio (adapters do); use a dated correction note or silent rewrite per ADR-FORMAT depending on git history. **Disposition: file (ready-agent, doc/ADR).** _(The Architecture reviewer's mirror finding — "add the re-exports to the codecs" — was DROPPED: it re-raises the decided design rather than fixing the stale ADR.)_

3. **ADR-0018 ring diagram + responsibilities table omit `wire/uuid.ts`** `docs/adr/0018-by-feature-codec-slices.md:78,85,108` The canonical layering reference never lists `src/wire/uuid.ts`, which exists as the ADR-0024 UUID-interop seam with three dedicated depcruise rules. A reader trusting the ring wouldn't know `uuid` is a wire leaf. **Direction:** add `wire/uuid.ts` to the ring + responsibilities table. **Disposition: file (ready-agent, doc/ADR).** _Touches the same file as finding 2 → file the two together or chain `Blocked by`._

4. **CONTEXT.md glossary understates which adapters require `IdGeneratingCodec`** `CONTEXT.md:13,15` The `IdGeneratingCodec` entry names only Prisma/MikroORM `idField` + Drizzle `generatedIdColumn`, and the `IdCodec` entry says "Most adapters (Kysely, TypeORM) call only `safeParse`." But `insertId` (Kysely, `kysely.ts:124`) and `beforeInsertHook` (TypeORM) both take `IdGeneratingCodec` — the code's own `adapter-types.ts:17` lists all five correctly. CONTRIBUTING requires CONTEXT.md to track adapter changes; this drifted when Kysely/TypeORM gained the constraint. **Direction:** update both entries to list all five ORM adapters (match `adapter-types.ts:17`). **Disposition: file (ready-agent, doc).**

5. **`createSignedTimestampId` constructor JSDoc + `@example` is detached from the function** `src/codecs/signed/index.ts:178` The doc block (with the `@example`) sits directly above `const defaultSignedTimestampOptions`, so editors/TypeDoc attach the constructor's docs to the const, not to `createSignedTimestampId`; the public constructor loses its hover docs. Introduced by #872, which placed the new const correctly in opaque (`opaque/index.ts:123` — const above the JSDoc) but between the JSDoc and the function in signed. **Direction:** move the const above the JSDoc block (mirror opaque). **Disposition: file (ready-agent, code/JSDoc).**

6. **`importWrappingKey` JSDoc says "AES-128 / AES-192 / AES-256 strength" but always derives AES-256** `src/codecs/wrapped/key.ts:51` The handle unconditionally derives `{ name: "AES-CBC", length: 256 }` (`key.ts:61`); input size is an entropy floor, not the AES strength. `opaque/key.ts:42` already carries the corrected "entropy floor only — a 16-byte handle still yields AES-256" phrasing; wrapped is the straggler. The website `wrapped.md` and SECURITY.md state it correctly. **Direction:** match the opaque phrasing. **Disposition: file (low-priority, doc/JSDoc).**

7. **Dead `-c` alias fallback in `parseCount`** `src/cli/flags.ts:5` `values.get("--count") ?? values.get("-c")` — `parseArgs` (`args.ts`) canonicalizes every alias to `spec.name` before populating `values`, so the map is never keyed by `"-c"` (confirmed by `args.test.ts`). The `?? values.get("-c")` branch is unreachable and misleads a reader into thinking raw aliases survive into the values map. **Direction:** drop the `?? values.get("-c")`. **Disposition: file (low-priority, code cleanup).**

8. **Prisma `{ needs, compute }` compute-field wrapper duplicated across the three field factories** `src/adapters/prisma.ts:219,263,320` (and `173,313`) `computeNullableField`'s body is byte-identical at three sites (`idField`, `nullableIdField`, `idFieldReadOnly`); `computeField` repeats at two. Clears ADR-0014's ">2 call sites" warrant on the nullable variant, but the shared code is a ~3-line wrapper that already delegates to `readIdColumn`/`readIdColumnNullable`. **Direction:** extract `makeComputeField(codec, fieldName)` / `makeNullableComputeField(...)` into `prisma.ts`. **Disposition: DROP — below the practical bar; the shared code is a ~3-line wrapper already delegating to shared readers, and the three factories are deliberately distinct public entry points. Not filed.**

## Dropped (with reason)

- **Architecture: "codec subpaths should re-export the error trio"** — DROP: re-raises a CLOSED design (CONTRIBUTING "error types live only in `@smonn/ids`"; settled by #852). The genuine artifact is the _stale ADR prose_, filed as finding 2 (a doc correction, not a code change).
- **`IdColumnCodec` no-op alias of `IdCodec`** `src/adapters/adapter-types.ts:15` — DROP: already documented in its own JSDoc as a deliberate public-naming seam for the ORM column context; intentional, not accidental complexity.
- **Key-accessor naming inconsistency across `key.ts`** (`getOpaqueKeyCryptoKey` vs `get*KeyHmacKey` vs `getWrappingKeyMaterial`) — DROP: internal-only, and each name is return-accurate (CryptoKey vs HMAC subkey vs material struct); reviewer self-rated not-a-defect.
- **`timingSafeEqual` length early-return; `decodeBase32` trust-the-type contract** — DROP: informational; documented contracts honored at every current call site (all fixed-width tags; the only base32 decoder caller pre-validates via `safeParse`), no live oracle.
- **`wrapped/layout.ts` DataView-per-lane allocation** `src/codecs/wrapped/layout.ts` — DROP: the prior follow-up pass deliberately left it unfiled; re-confirmed "not measurable end-to-end" (dwarfed by the AES-CBC + HMAC subtle calls on the same path).
- **kysely `transformResult` `{...row}` spread** `src/adapters/kysely.ts:199` — DROP (closed): the only correctness-safe optimization reverses #846's deliberate immutable-copy posture; re-confirmed from the prior pass.

## Already decided — not raised (gate proof)

Surfaced by reviewers and correctly suppressed:

- Opaque AES-CBC zero-IV strip-and-reconstruct; wrong-key decrypt yields plausible garbage, no padding oracle, no error → `closed:ADR-0004` / `ADR-0007`.
- Decode-then-verify ordering and sequential keyring trial-verify timing in wrapped/signed → `closed:ADR-0009` / `ADR-0012`.
- HKDF empty salt, separation by `info` label only; five labels distinct → `closed:ADR-0019` / `ADR-0027`.
- Truncated-MAC tail widths (signed 40-bit, wrapped 64-bit, digest 128-bit) → `closed:ADR-0012` / `ADR-0009` / `ADR-0017`.
- Raw IKM survives the caller's buffer after import; no `Uint8Array` zeroing → `closed:ADR-0016`.
- Six codec `index.ts`, four keyed `key.ts`, transport + ORM adapter mirroring incl. `IdParamError` `status`/`statusCode` → `closed:ADR-0014` / `ADR-0020`.
- `is()` canonical-strict vs lenient `safeParse`; payload byte split / order / precision / custom epoch; monotonicity inside `generate()` → `closed:ADR-0003` / `ADR-0002`.
- Keyed-codec conformance vectors absent from `spec/vectors.json` → `closed:ADR-0025` (deferred to v2) / `ADR-0026`.
- Hand-rolled branchless `timingSafeEqual` instead of `node:crypto` → Web-Crypto cross-runtime portability posture.
- CLI `--key` on the process arg list / unbounded stdin / `IDS_KEY` read → `closed:ADR-0033`.
- No wire version marker; same-millisecond sort non-determinism; version-agnostic `fromUUID` → `closed:ADR-0007` / `ADR-0002` / `ADR-0024`.

## Filed as

| # | Finding | Issue |
| --- | --- | --- |
| 1 | README error-trio "only from @smonn/ids" | #873 |
| 2 + 3 | ADR-0011/ADR-0018 error re-export prose + `wire/uuid.ts` in ADR-0018 ring | #874 |
| 4 | CONTEXT.md `IdGeneratingCodec` adapter list | #875 |
| 5 | signed constructor JSDoc/@example detachment | #876 |
| 6 | wrapped `importWrappingKey` AES-strength JSDoc | #877 |
| 7 | dead `-c` alias fallback in `parseCount` | #878 |
| 8 | prisma compute-field wrapper duplication | dropped (below bar) |
