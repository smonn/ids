---
title: Error handling
description: All 12 IdsErrorCode values, both error channels, IdsError, and how to use isIdsError() to handle errors programmatically.
---

The library surfaces failures through two distinct channels depending on the
operation:

- **Thrown channel** — `IdsError` thrown by `parse`, key import/decode,
  `wrap`/`unwrap`, `verify`, codec construction, and ORM adapter read paths.
- **Returned channel** — `ParseError` returned (not thrown) by `safeParse`,
  `safeFromUUID`, and `safeUnwrap` / `safeVerify` for structural input problems.

## IdsError

`IdsError` extends `Error` with one stable field:

```ts
class IdsError extends Error {
  readonly code: IdsErrorCode; // stable discriminant — branch on this
  // message: string            // human-readable, non-contractual
}
```

`code` is the **only stable, machine-readable field** — its values are a
public stability contract. `message` may be restated in any release and must
not be matched programmatically.

When `code` is `"invalid_id"`, the originating `ParseError` string is attached on `err.cause`. When `code` is `"invalid_key_encoding"`, the original decode `Error` (e.g. out-of-alphabet, non-canonical bits, over-length) is attached on `err.cause` — the public code is stable; `cause` carries the specific reason.

## isIdsError()

Use `isIdsError(value)` to test whether a caught value is an `IdsError`. Do
not use bare `instanceof` — it silently fails when the package is loaded more
than once in the same process (the ESM + CJS dual-package hazard).

`isIdsError` is re-exported from the root entry point, the GraphQL adapter, and every ORM adapter entry point:

- `@smonn/ids`
- `@smonn/ids/graphql`
- `@smonn/ids/drizzle`
- `@smonn/ids/kysely`
- `@smonn/ids/prisma`
- `@smonn/ids/typeorm`
- `@smonn/ids/mikro-orm`

```ts
import { isIdsError } from "@smonn/ids";

try {
  users.parse(rawInput);
} catch (err) {
  if (isIdsError(err)) {
    switch (err.code) {
      case "invalid_id":
        // err.cause is the ParseError string
        return 400;
      case "invalid_brand":
        // bug in codec construction — re-throw
        throw err;
    }
  }
  throw err;
}
```

## IdsErrorCode reference

All 12 codes are a public stability contract. Adding a code is minor-additive;
renaming or removing one is breaking.

| Code                      | Trigger                                                                                                                                                                                                                                                                                                                          |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `invalid_brand`           | Brand passed to a codec constructor is not exactly three lowercase `a–z` characters                                                                                                                                                                                                                                              |
| `invalid_namespace`       | `ns` passed to the Digest codec constructor is empty or whitespace-only                                                                                                                                                                                                                                                          |
| `invalid_key_format`      | Declared format is not `"hex"` or `"base64url"`                                                                                                                                                                                                                                                                                  |
| `invalid_key_encoding`    | Encoded key string is malformed for its declared format (bad hex digits, bad base64url); `err.cause` holds the original decode `Error`. Note: an empty hex string (`""`) is **not** in scope for this code as of 1.2.4 — it decodes successfully to zero bytes and fails at the length check instead (see `invalid_key_length`). |
| `invalid_key_length`      | Raw key bytes are not 16, 24, or 32 bytes. Thrown by `import*Key` when the caller passes a wrong-length byte array, and by `decode*Key` when a hex or base64url-encoded key string decodes successfully but yields fewer than 16 bytes (e.g. an empty hex string `""` decodes to 0 bytes).                                       |
| `invalid_kind`            | `kind` passed to the Wrapped key codec constructor is not `"u32"`, `"i32"`, `"u64"`, or `"i64"`                                                                                                                                                                                                                                  |
| `empty_keyring`           | `keys` array passed to a keyed codec constructor contains zero entries                                                                                                                                                                                                                                                           |
| `duplicate_keyring_entry` | `keys` array passed to a keyed codec constructor contains two entries backed by the same raw secret                                                                                                                                                                                                                              |
| `invalid_lookup_key`      | Value passed to `wrap()` is out of range, is the wrong JS type, or is negative zero (`u32`/`i32` only)                                                                                                                                                                                                                           |
| `verification_failed`     | No keyring entry's tag matches the payload — thrown by `unwrap()` / `verify()`, returned as a string by `safeUnwrap()` / `safeVerify()`                                                                                                                                                                                          |
| `invalid_id`              | String is not a structurally valid ID for the brand — thrown by `parse()` and ORM adapter read and write paths; `err.cause` holds the `ParseError` string                                                                                                                                                                        |
| `invalid_timestamp`       | Date passed to `generateAt`, `minIdForTime`, or `maxIdForTime` is Invalid Date, pre-epoch, or exceeds the 48-bit range                                                                                                                                                                                                           |

## The returned channel: ParseError

`safeParse`, `safeFromUUID`, `safeUnwrap`, and `safeVerify` **return** errors
rather than throwing. The structural parse failures are the `ParseError` union:

| Value              | Meaning                                                              |
| ------------------ | -------------------------------------------------------------------- |
| `"not_string"`     | Input was not a string                                               |
| `"invalid_prefix"` | String does not start with the expected brand prefix                 |
| `"invalid_base32"` | Prefix matched but payload is malformed or has non-zero padding bits |
| `"invalid_uuid"`   | `safeFromUUID` input is not a canonical `8-4-4-4-12` UUID string     |

`safeParse` returns `not_string`, `invalid_prefix`, or `invalid_base32`;
`safeFromUUID` returns only `not_string` or `invalid_uuid`. `fromUUID` throws
`IdsError` (`code: "invalid_id"`) carrying the same `ParseError` on `err.cause`.

`safeUnwrap` and `safeVerify` also return `"verification_failed"` as a plain
string when structural parsing succeeds but the tag does not match — it is
never thrown from those methods.

```ts
const result = users.safeParse(rawInput);

if (!result.ok) {
  switch (result.error) {
    case "not_string":
      return 400; // wasn't a string at all
    case "invalid_prefix":
      return 404; // wrong kind of ID (or not an ID)
    case "invalid_base32":
      return 400; // prefix matched but payload is malformed
  }
}

const userId = result.id; // Id<"usr">, canonical
```
