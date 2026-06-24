---
title: Error handling
description: All 11 IdsErrorCode values, both error channels, IdsError, and how to use isIdsError() to handle errors programmatically.
---

The library surfaces failures through two distinct channels depending on the
operation:

- **Thrown channel** — `IdsError` thrown by `parse`, key import/decode,
  `wrap`/`unwrap`, `verify`, codec construction, and ORM adapter read paths.
- **Returned channel** — `ParseError` returned (not thrown) by `safeParse` and
  `safeUnwrap` / `safeVerify` for structural input problems.

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

When `code` is `"invalid_id"`, the originating `ParseError` string is
attached on `err.cause`.

## isIdsError()

Use `isIdsError(value)` to test whether a caught value is an `IdsError`. Do
not use bare `instanceof` — it silently fails when the package is loaded more
than once in the same process (the ESM + CJS dual-package hazard).

`isIdsError` is re-exported from every codec and ORM adapter entry point:

- `@smonn/ids`
- `@smonn/ids/opaque`
- `@smonn/ids/reverse`
- `@smonn/ids/signed`
- `@smonn/ids/wrapped`
- `@smonn/ids/digest`
- `@smonn/ids/drizzle`
- `@smonn/ids/kysely`
- `@smonn/ids/prisma`

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

All 11 codes are a public stability contract. Adding a code is minor-additive;
renaming or removing one is breaking.

| Code                      | Trigger                                                                                                                                  |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `invalid_brand`           | Brand passed to a codec constructor is not exactly three lowercase `a–z` characters                                                      |
| `invalid_namespace`       | `ns` passed to the Digest codec constructor is empty or whitespace-only                                                                  |
| `invalid_key_format`      | Declared format is not `"hex"` or `"base64url"`                                                                                          |
| `invalid_key_encoding`    | Encoded key string is malformed for its declared format (bad hex digits, bad base64url)                                                  |
| `invalid_key_length`      | Raw key bytes passed to an `import*Key` function are not 16, 24, or 32 bytes                                                             |
| `invalid_kind`            | `kind` passed to the Wrapped key codec constructor is not `"u32"`, `"i32"`, `"u64"`, or `"i64"`                                          |
| `empty_keyring`           | `keys` array passed to a keyed codec constructor contains zero entries                                                                   |
| `duplicate_keyring_entry` | `keys` array passed to a keyed codec constructor contains two entries backed by the same raw secret                                      |
| `invalid_lookup_key`      | Value passed to `wrap()` is out of range, is the wrong JS type, or is negative zero (`u32`/`i32` only)                                   |
| `verification_failed`     | No keyring entry's tag matches the payload — thrown by `unwrap()` / `verify()`, returned as a string by `safeUnwrap()` / `safeVerify()`  |
| `invalid_id`              | String is not a structurally valid ID for the brand — thrown by `parse()` and ORM adapter read paths; `err.cause` holds the `ParseError` |

## The returned channel: ParseError

`safeParse`, `safeUnwrap`, and `safeVerify` **return** errors rather than
throwing. The structural parse failures are the `ParseError` union:

| Value              | Meaning                                                              |
| ------------------ | -------------------------------------------------------------------- |
| `"not_string"`     | Input was not a string                                               |
| `"invalid_prefix"` | String does not start with the expected brand prefix                 |
| `"invalid_base32"` | Prefix matched but payload is malformed or has non-zero padding bits |

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
