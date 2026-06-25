## Summary

Hardens the CLI test suite in two ways:

1. **`src/cli.test.ts`** — Downgraded exact English stderr `toBe(...)` assertions on exit-code-2 (usage error) and exit-code-1 (runtime error) paths to assert on exit code and stable error substrings (`toContain`/`toMatch`). Message text is non-contractual per CONTEXT.md; exit code and IdsError code are the contract. Added an `it.fails` test documenting that `run()` has no top-level try/catch — a throwing `readStdin` escapes as an unhandled rejection rather than mapping to exit 1.

2. **`src/cli/flags.test.ts`** — Added 28 new direct unit tests covering `parseCount` (7 cases including `maxGenerateCount` boundary and `Number.isSafeInteger` guard), `parseBits` (5 cases), `parseKind` (7 cases), `parseNs` (3 cases), `unsupportedFlagForCommand` (3 cases), and `canonicalFlag` via `splitFlags` duplicate detection (3 cases including `-c 2 -c 3` and reversed alias ordering).

## Linked issue

Closes #574

## Test plan

- [x] `pnpm test` — 1037 tests: 1036 passed, 1 expected fail
- [x] `pnpm typecheck` — no errors
- [x] `pnpm lint` — no violations
- [x] `pnpm fmt:check` — all files formatted
- [x] `pnpm depcruise` — no dependency violations
- [x] `pnpm build` — build complete
- [x] `pnpm test:coverage` — 100% statements/branches/functions/lines

## Impact checklist

- Public API: N/A
- Wire format or Byte layout: N/A
- CLI behavior: N/A (tests only)
- README or other docs: N/A
- CONTEXT.md domain vocabulary: N/A
- ADR needed or updated: N/A

## Closed design decisions

None
