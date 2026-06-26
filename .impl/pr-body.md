## Summary

- `inspect` now prints a `uuid:` line (raw `toUUID` of the canonical id) for every non-digest codec variant (readable, keyed-readable, unwrap, verify — including the unavailable/failed signed paths)
- `generate <brand> --uuid` emits the raw UUID form of each generated id instead of the canonical id; works alongside `--opaque`, `--reverse`, `--signed`, and `--digest`
- `inspect --from-uuid <uuid> --brand <brand>` converts a UUID back to a canonical `Id<Brand>` via `safeFromUUID`; emits `invalid_uuid: not a valid RFC 9562 UUID` to stderr on bad input (exit 1) and requires `--brand` (exit 2 without it)
- `usageInspect()` and `usageGenerate()` updated to document all three new flags

## Linked issue

Closes #615

## Test plan

- [x] `pnpm test` — 1173 tests pass (21 new)
- [x] `pnpm typecheck`
- [x] `pnpm lint`
- [x] `pnpm fmt:check`
- [x] `pnpm depcruise`
- [x] `pnpm test:coverage` — 100% branch coverage

## Impact checklist

- [ ] Public API: N/A — no library API changes; only CLI behavior
- [ ] Wire format or Byte layout: N/A — no changes
- [x] CLI behavior: `inspect` output gains a `uuid:` line; new `--uuid` flag for `generate`; new `--from-uuid`/`--brand` flags for `inspect`
- [ ] README or other docs: N/A — docs owned by separate issue per ADR-0024 Consequences
- [ ] CONTEXT.md domain vocabulary: N/A
- [ ] ADR needed or updated: N/A — ADR-0024 already covers the Raw UUID mapping; this PR just wires the CLI surface

## Closed design decisions

None.
