## Summary

Widens the `--key-file` permission check mask from `0o044` (group/other read bits only) to `0o077` (all group/other permission bits) so write and execute bits also trigger the advisory warning on stderr. A key file with mode `0o622` (group-writable) previously passed silently — arguably worse than group-readable, since a writer can swap the key.

Changes:
- `src/cli/key.ts`: mask changed from `0o044` to `0o077`; advisory message updated from "group- or other-readable" to "accessible to group/others"
- `src/cli/key.test.ts`: six new boundary tests — `0o640`, `0o604`, `0o620`, `0o602` each warn; `0o600` and `0o700` stay silent
- `website/src/content/docs/cli.md`: updated the Key-file permissions paragraph to reflect `0o077` and the revised wording

## Linked issue

Closes #932

## Test plan

- [x] `pnpm test`
- [x] `pnpm typecheck`
- [x] `pnpm lint`
- [x] `pnpm fmt:check`
- [x] `pnpm depcruise`
- [ ] Other / not run:

All 1561 tests pass with 100% coverage. The six new boundary tests in `key.test.ts` each cover a distinct single permission bit (`0o640`, `0o604`, `0o620`, `0o602` warn; `0o600`, `0o700` silent).

## Impact checklist

- [ ] Public API: N/A — no library API change
- [ ] Wire format or Byte layout: N/A
- [x] CLI behavior: advisory fires in more cases (any group/other permission bit set, not only readable bits); no exit-code change
- [ ] README or other docs: N/A
- [x] Website docs (`website/src/content/docs/` — adapters/codecs/CLI/errors pages): updated `cli.md` Key-file permissions paragraph
- [ ] CONTEXT.md domain vocabulary: N/A
- [ ] ADR needed or updated: N/A — consistent with ADR-0033's intent

## Closed design decisions

None.
