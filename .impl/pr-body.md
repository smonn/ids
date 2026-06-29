## Summary

Three coupled code-shape cleanups across the six `src/codecs/*/layout.ts` files and the shared wire helper module, from the 2026-06-29 whole-tree audit (findings #9, #10, #11):

- **Drop dead `ms?` parameter.** `LayoutOps.exampleWireId` in `src/types.ts` declared `ms?: number`; every implementation named it `_ms?` and ignored it; every caller passed nothing. The parameter is removed from the type and all six implementations.
- **Hoist `schemaExampleId`.** The `prefix + "0".repeat(payloadBase32Length)` literal was copy-pasted across all six layouts (and as local `schemaExample` closures in `opaque/layout.ts` and `wrapped/layout.ts`). A single `schemaExampleId(prefix)` function now lives in `src/wire/invariants.ts` alongside `payloadBase32Length`; all six layouts call it.
- **Extract `invertTimestampBytes`.** `reverse/layout.ts` had identical `~buffer[i]! & 0xff` inversion loops in `buildReversePayload` and `buildReverseSentinelPayload`. Both now call `invertTimestampBytes(buffer)`. The decode-side loop in `extractReverseTimestampFromId` stays inline (combines inversion and big-endian accumulation in one pass without a temp buffer; factoring would add allocation).

No wire bytes, no `spec/vectors.json`, no ADR-locked construction, and no public API surface were touched.

## Linked issue

Closes #798

## Test plan

- [x] `pnpm test`
- [x] `pnpm typecheck`
- [x] `pnpm lint`
- [x] `pnpm fmt:check`
- [x] `pnpm depcruise`
- [ ] Other / not run: N/A

All 1360 tests pass; coverage remains 100% statements/branches/functions/lines.

The type test for `LayoutOps.exampleWireId` (previously `(ms?: number) => Id<Brand>`) was updated to reflect the new signature `() => Id<Brand>`. Two new tests were added to `src/wire/invariants.test.ts` verifying `schemaExampleId` returns the expected zero-filled string.

## Impact checklist

- Public API: N/A — `LayoutOps`, `exampleWireId`, and `schemaExampleId` are internal; none are re-exported from any public subpath.
- Wire format or Byte layout: N/A — no byte-level change.
- CLI behavior: N/A.
- README or other docs: N/A.
- Website docs (`website/src/content/docs/`): N/A.
- CONTEXT.md domain vocabulary: N/A.
- ADR needed or updated: N/A — ADR-0010 reverse inversion semantics are preserved unchanged.

## Closed design decisions

None.
