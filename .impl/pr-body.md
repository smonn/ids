## Summary

- Adds `"invalid_uuid"` to the `ParseError` type entry in the README Types section.
- Documents `toUUID(id)`, `fromUUID(value)`, and `safeFromUUID(value)` in a new "Shared codec methods (all variants)" subsection under the API surface.
- Adds a "Spec-valid UUIDv7 output" bullet to "What this is not for", explaining that `toUUID` produces a raw, unversioned UUID (lossless round-trip, not spec-valid UUIDv7) and that importing a non-time-ordered UUID yields a structurally valid id with a meaningless timestamp — cross-referencing the wire-indistinguishable contract.
- Adds a "Native `uuid` column storage" note to the Integrations section: an `Id<Brand>` can be persisted into a native `uuid` column via `toUUID` and read back via `fromUUID`/`safeFromUUID`.
- CONTEXT.md verified: the "Raw UUID mapping" glossary term already references `toUUID`/`fromUUID`/`safeFromUUID` correctly; no change required.

## Linked issue

Closes #616

## Test plan

- [x] `pnpm test` — 1152 tests, all passing
- [x] `pnpm typecheck` — no errors
- [x] `pnpm lint` — no violations
- [x] `pnpm fmt:check` — all files correctly formatted (ran `pnpm fmt` first to auto-resolve)
- [x] `pnpm depcruise` — no dependency violations (115 modules, 397 dependencies)
- [ ] Other / not run: `pnpm test:coverage` — run as part of full gate; 100% coverage maintained

## Impact checklist

- Public API: N/A — no code changed; the `ParseError` union and codec methods already shipped in #617; this is the README documentation of that surface.
- Wire format or Byte layout: N/A
- CLI behavior: N/A
- README or other docs: Yes — `README.md` updated with `ParseError` extension, codec method docs, new "What this is not for" bullet, and Integrations note.
- CONTEXT.md domain vocabulary: No change — "Raw UUID mapping" term already consistent with shipped method names.
- ADR needed or updated: No — semantics are fully settled by ADR-0024; this is descriptive documentation only.

## Closed design decisions

None.
