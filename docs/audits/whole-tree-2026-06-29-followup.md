# Audit — whole source tree (2026-06-29, follow-up pass)

Point-in-time snapshot. **Non-authoritative**: superseded by the filed issues (#852–#861). It runs *after* the morning whole-tree audit (`whole-tree-2026-06-29.md`, snapshotted in #824), whose 15 findings all shipped (#838–#851); the gate suppressed every already-fixed item.

**Scope:** whole `src/` tree, plus `test/`, `spec/`, `docs/adr/`, and `website/` for the relevant dimensions. **Method:** ten parallel dimension reviewers, each gated against the decided digest (all 33 ADRs with terminal status + the SPEC/CONTEXT/CONTRIBUTING closed items). Findings a digest line or ADR settles were dropped or tagged `closed:ADR-N` and do not appear as Open below — see the appendix.

The trust-critical core is clean. **Security (×2), Accuracy/correctness, and Duplication returned zero open findings** on verified grounds: byte math was independently reimplemented and cross-checked against `spec/vectors.json`; the five HKDF domain-separation labels are distinct (no key-reuse collision); truncated-tag widths (signed 40-bit, wrapped 64-bit, digest full 128-bit) match their ADRs; the AES-CBC strip-and-reconstruct has no padding oracle by construction; the compare is branchless and length-checked; and the tree is already de-duplicated to the ADR-0014 warrant. **No Critical or High findings in code.** The two High findings are user-facing documentation drift that breaks copy-paste; the rest are doc-accuracy, a test-seam gap, and small quality cleanups.

## Open findings (ranked)

### High — documentation

1. **`errors.md` lists `isIdsError` as re-exported from five codec subpaths that don't export it** `website/src/content/docs/errors.md:38-51` `import { isIdsError } from "@smonn/ids/opaque"` (and `/reverse`, `/signed`, `/wrapped`, `/digest`) resolves to `undefined`. Verified: zero `isIdsError` exports in `src/codecs/*/index.ts`. The real re-export set is `@smonn/ids` + graphql + the five ORM adapters. **Disposition: file (ready-agent, doc).**

2. **`timestamp.md` says `generateAt` invalid-date cases throw "a plain `Error` (not `IdsError`)"** `website/src/content/docs/codecs/timestamp.md:129-132` `src/wire/timestamp-bytes.ts:12-15` throws `IdsError` with `code: "invalid_timestamp"`; contradicts `errors.md`/`README`. Same class as the already-fixed #838, distinct file. **Disposition: file (ready-agent, doc).**

### Medium

3. **ADR-0018 ring diagram + step-6 checklist name CLI modules that don't exist** `docs/adr/0018-by-feature-codec-slices.md:55,61-66` Refers to `cli/variants.ts` / `dispatch.ts` / `key-io.ts`; the real registry is `cli/router.ts` + `cli/codecs/<name>.ts`. A maintainer following the "zero-edit" checklist edits phantom files. Also scope the "zero-edit" claim to the dependency layer (CLI wiring is genuinely 2 sites). Per ADR-FORMAT, this is a silent rewrite (inaccurate from merge, not accurate-then-stale). **Disposition: file (ready-agent, doc/ADR).**

4. **No CLI wrong-key negative test for opaque (and wrapped)** `src/cli/router.test.ts` (missing) Opaque `inspect` returns plausible-garbage on a wrong key (GIGO by ADR-0004); a regression ignoring `--key` would pass the only opaque CLI test (same-key round-trip). Wrapped CLI tests flip `--kind` but never a wrong `--key`. AC encodes each contract: opaque → exit 0 + wrong timestamp; wrapped → exit 1 + `verification_failed`. **Disposition: file (ready-agent, test).**

### Low — quality / cleanup

5. **`wrapped/layout.ts` allocates a `DataView` per lane read/write** `src/codecs/wrapped/layout.ts:47-71` One short-lived DataView per wrap and per unwrap-trial; the `*U32Lane` helpers already use manual shifts. Direction: drop DataView, use manual shifts. **Disposition: file (low-priority).**

6. **`toJsonSchema(brand, example)` re-derives data `wireMethods(prefix)` already holds** `src/wire/codec-shell.ts:34` + 6 codec `index.ts` Both params are recoverable from `prefix`; making it parameterless deletes a duplicated line and the `schemaExampleId` re-export from all six codecs. **Disposition: file (low-priority).**

7. **`timestamp/layout.ts` single-call-site forwarding helpers** `src/codecs/timestamp/layout.ts:13-32` `buildPayload`/`buildSentinelPayload` each wrap 2 statements called from exactly one closure, passing closure-scoped vars as params. **Disposition: file (low-priority).**

8. **opaque & signed inline option-defaulting** `src/codecs/opaque/index.ts:134-139`, `src/codecs/signed/index.ts` Skip the `defaultXOptions`+`Resolved` idiom #851 standardized for timestamp/reverse. **Disposition: file (low-priority; `Blocked by` the `toJsonSchema` issue — shares opaque/signed `index.ts`).**

9. **`_kernel/key-material.ts` untested + depcruise lacks its `.test.ts` exemption** `src/codecs/_kernel/key-material.ts`, `.dependency-cruiser.cjs:194-203` The shared keyring/encoding validator gating every keyed codec is only tested transitively; and `key-material-leaf-restricted` omits the `\.test\.ts$` exemption its `crypto`/`rng` siblings carry, so the first co-located test fails depcruise. File both together. **Disposition: file (ready-agent, test+infra).**

10. **`digest/layout.ts` hardcodes `4` for the len32 width while sibling `wrapped` uses `len32ByteLength`** `src/codecs/digest/layout.ts:15,19,23` Same class as #850, missed sibling; digest silently desyncs if the width ever changes. **Disposition: file (low-priority).**

11. **`cli/codec-options.ts` `codecOpts` typed/named `TimestampOptions` but is the shared base** `src/cli/codec-options.ts` Forces digest/wrapped CLI to hand-inline `allowDuplicateBrand: true` with the rationale comment copy-pasted. **Disposition: file (low-priority).**

## Dropped (with reason)

- **kysely `transformResult` row-spread** — `src/adapters/kysely.ts:199-205`. The `{...row}` shallow copy persists after #846, but the only correctness-safe optimization (mutate the driver's rows in place) reverses #846's deliberate immutable-copy posture for a marginal allocation gain and risks the driver reusing rows. **Drop (reverses a deliberate posture for marginal gain).**
- **`IdParamError` declared 3× with a drifting `status` / `statusCode` field** — `src/adapters/{express,fastify,hono}.ts`. Fastify's `statusCode` is its framework-native field; the divergence is exactly what ADR-0020 mandates, and the Duplication dimension already closed the transport-adapter mirroring. **Drop (`closed:ADR-0020`).**
- **`adapter-types` positional-noun argument** — the reviewer self-rated it not worth a refactor. **Drop (below filing bar).**

## Already decided — not raised (gate proof)

Surfaced by reviewers and correctly suppressed by the gate:

- Raw IKM bytes survive in the caller's buffer after import → `closed:ADR-0016` (the handle retains no raw secret; a SHA-256 digest backs keyring equality; JS cannot reliably zero a `Uint8Array`).
- Opaque AES-CBC zero-IV strip-and-reconstruct; wrong-key decrypt yields garbage, no padding oracle → `closed:ADR-0004`.
- Decode-then-verify ordering in wrapped/signed → `closed:ADR-0009` / `ADR-0012` (no oracle).
- HKDF empty salt, separation by `info` label only; five labels distinct → `closed:ADR-0019` / `ADR-0027`.
- Truncated-MAC tail widths (signed 40-bit, wrapped 64-bit, digest full 128-bit) → `closed:ADR-0012` / `ADR-0009` / `ADR-0017`.
- Ordered-keyring trial-verify timing (sequential awaits) → `closed:ADR-0012` / `ADR-0009`.
- Six codec `index.ts`, four keyed `key.ts`, transport + ORM adapter mirroring incl. `IdParamError` `status`/`statusCode` → `closed:ADR-0014` / `ADR-0020`.
- `IdColumnCodec` exact alias; `convert` minting a Timestamp codec to reach `fromUUID` → `closed:ADR-0020` / `ADR-0024` (inherent, not accidental, complexity).
- Keyed-codec conformance vectors absent from `spec/vectors.json` → `closed:ADR-0025` (deferred to v2) / `ADR-0026`.
- Hand-rolled branchless `timingSafeEqual` instead of `node:crypto` → Web-Crypto cross-runtime portability posture (importing `node:crypto` would break Deno/browser/worker).
- CLI `--key` on the process list / unbounded stdin / `IDS_KEY` read → `closed:ADR-0033` (explicit key sources; operator-controlled, self-DoS only).

## Filed as

| # | Finding | Issue |
| --- | --- | --- |
| 1 | errors.md `isIdsError` re-export list | #852 |
| 2 | timestamp.md `generateAt` error type | #853 |
| 3 | ADR-0018 phantom CLI modules | #854 |
| 4 | CLI wrong-key tests (opaque + wrapped) | #855 |
| 6 | parameterless `toJsonSchema` | #856 |
| 7 | timestamp forwarding helpers | #857 |
| 8 | opaque/signed option-defaulting (Blocked by #856) | #858 |
| 9 | key-material test + depcruise exemption | #859 |
| 10 | digest `len32ByteLength` | #860 |
| 11 | `codecOpts` shared base | #861 |
