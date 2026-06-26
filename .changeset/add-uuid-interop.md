---
"@smonn/ids": minor
---

Add `toUUID`, `fromUUID`, and `safeFromUUID` to all six codec variants (Timestamp, Reverse Timestamp, Opaque, Signed, Wrapped Key, Digest).

- `toUUID(id)` converts any `Id<Brand>` to a lowercase RFC 9562 hyphenated UUID string (`8-4-4-4-12`) by treating the 16-byte payload verbatim as 128 bits. Never throws.
- `safeFromUUID(value)` parses a case-insensitive UUID string and returns a `ParseResult<Brand>` — `{ ok: false, error: "not_string" }`, `{ ok: false, error: "invalid_uuid" }`, or `{ ok: true, id }`. Never throws.
- `fromUUID(value)` is the throwing variant: returns `Id<Brand>` or throws `IdsError` with `code: "invalid_id"` and `cause` set to the `ParseError` string.
- `ParseError` union gains the `"invalid_uuid"` member.
- All three methods live in the shared wire layer (`src/wire/uuid.ts`) and are delegated from `wireMethods()`; no per-codec duplication.
