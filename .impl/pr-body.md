## Summary

Closes #474

- Adds `ValidBrand` — the 17,576-member template-literal union `${BrandChar}${BrandChar}${BrandChar}` — to `src/types.ts` and exports it from the main package entry point.
- Tightens every `Brand extends string` constraint to `Brand extends ValidBrand` across all codec factory functions, type aliases, wire helpers, and adapter types, so passing a brand that is not exactly three lowercase a–z characters is a **compile-time error**.
- CLI commands that work with runtime-dynamic brands use `brand as unknown as ValidBrand` (runtime validation still fires inside the factory, unchanged).
- A dedicated type-level test suite (`src/types.test.ts`) verifies both positive inference (`createTimestampId("usr")` → `TimestampCodec<"usr">`) and negative compile-time errors (2-char, 4-char, and non-alpha brands produce `@ts-expect-error`).

## Impact checklist

- [x] No breaking change for any caller that already passes a 3-lowercase-letter brand literal — type inference is unchanged (`createTimestampId("usr")` still infers `Brand = "usr"` with no annotation).
- [x] Callers passing runtime `string` brands (e.g. CLI, dynamic dispatch) must add an `as unknown as ValidBrand` cast; existing internal CLI code updated accordingly.
- [x] `ValidBrand` is now exported and usable by downstream consumers who need to constrain their own generics.
- [x] Changeset filed as `minor` (additive API surface; no runtime behaviour change).

## Test plan

- [x] `pnpm typecheck` — PASS (0 errors)
- [x] `pnpm test` — PASS (929/929 tests)
- [x] `pnpm test:coverage` — PASS (100% statements, branches, functions, lines)
- [x] `pnpm lint` — PASS
- [x] `pnpm fmt:check` — PASS
- [x] `pnpm depcruise` — PASS
- [x] `pnpm build` — PASS
- [x] New `src/types.test.ts` type-level tests: `@ts-expect-error` on `"ab"`, `"user"`, `"123"`; positive inference for `"usr"`
- [x] Existing invalid-brand runtime tests in `opaque/index.test.ts` and `reverse/index.test.ts` annotated with `@ts-expect-error` (still verify throws at runtime)
