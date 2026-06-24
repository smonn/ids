---
title: Wrapped key codec
description: Wrap a u32/i32/u64/i64 integer lookup key into a verifiable public branded ID.
---

The Wrapped key codec turns an internal integer primary key into a public,
verifiable branded ID. `wrap(lookupKey)` returns a public ID; `unwrap(id)`
verifies the payload and returns the lookup key; `safeUnwrap(input)` is the
non-throwing path for untrusted input.

```ts
import { createWrappedKeyId, importWrappingKey } from "@smonn/ids/wrapped";

const key = await importWrappingKey(new Uint8Array(32));

const invoices = createWrappedKeyId("inv", { kind: "u32", keys: [key] });
const id = await invoices.wrap(42); // number → Id<"inv">
const lookupKey = await invoices.unwrap(id); // → 42 (number)
```

`wrap`, `unwrap`, and `safeUnwrap` are **async** (WebCrypto). `is`, `parse`, and
`safeParse` are structural and sync — no key required.

## Integer kinds and value types

The 32-bit kinds (`u32`, `i32`) use safe JavaScript `number` values. The 64-bit
kinds (`u64`, `i64`) always use `bigint` — even when the magnitude would fit in a
`number` — to prevent silent truncation or sign erasure.

| Kind  | JS type  | Range                                           |
| ----- | -------- | ----------------------------------------------- |
| `u32` | `number` | `[0, 4294967295]`                               |
| `i32` | `number` | `[-2147483648, 2147483647]`                     |
| `u64` | `bigint` | `[0n, 18446744073709551615n]`                   |
| `i64` | `bigint` | `[-9223372036854775808n, 9223372036854775807n]` |

```ts
const orders = createWrappedKeyId("ord", { kind: "u64", keys: [key] });
const id = await orders.wrap(42n); // bigint → Id<"ord">
const key64 = await orders.unwrap(id); // → 42n (bigint)
```

## Key import and storage

Import raw operator secret bytes with `importWrappingKey`. It accepts **16, 24,
or 32 bytes** (AES-128 / AES-192 / AES-256 strength) and returns an opaque
`WrappingKey` handle. One raw secret derives into AES and HMAC subkeys held
inside the handle; the raw bytes are not retained.

To store or transport key material, use `encodeWrappingKey` / `decodeWrappingKey`
with `"hex"` or `"base64url"` — not Crockford base32, which is reserved for ID
payloads.

```ts
import { importWrappingKey, encodeWrappingKey, decodeWrappingKey } from "@smonn/ids/wrapped";

// Generate 32 raw bytes (AES-256 strength)
const rawBytes = crypto.getRandomValues(new Uint8Array(32));

// Encode for storage (e.g. in an environment variable or secret manager)
const encoded = encodeWrappingKey(rawBytes, "base64url"); // string

// Decode back to raw bytes and import
const decoded = decodeWrappingKey(encoded, "base64url"); // Uint8Array
const key = await importWrappingKey(decoded); // WrappingKey
```

Wrapping-key material is a **separate secret domain** from Opaque and Signing
keys — same `hex` / `base64url` encoding conventions but a distinct `WrappingKey`
handle and HKDF label, so one raw secret cannot silently serve multiple codecs.

## Structural methods

`is`, `parse`, `safeParse`, and `toJsonSchema` are synchronous and need no key
material — they validate the prefix and base32 shape only, not payload integrity.

**`is(value)`** is the strict type guard: returns `true` only for an
already-canonical (lowercase, Crockford aliases resolved) `Id<Brand>` string.
Feeding uppercase to `is` returns `false` — even if the ID is otherwise valid.
Use `is` to discriminate brand on input you already trust; do not use it at
untrusted boundaries.

**`parse(value)`** and **`safeParse(value)`** normalize first — they accept
uppercase and Crockford visual aliases (`o → 0`, `i → 1`, `l → 1`) — and return
the canonical lowercase form on success. `parse` throws `IdsError` with
`code: "invalid_id"` on failure; `safeParse` returns `{ ok: false, error }`.

```ts
const id = await invoices.wrap(42);

invoices.is(id); // true  — already canonical
invoices.is(id.toUpperCase()); // false — not canonical; use parse/safeParse

invoices.parse(id.toUpperCase()); // → canonical Id<"inv">
invoices.safeParse(id.toUpperCase()); // → { ok: true, id: "inv_…" }
```

**`toJsonSchema()`** returns a JSON Schema object describing the canonical wire
format — useful for OpenAPI `components.schemas` entries:

```ts
invoices.toJsonSchema();
// {
//   type: "string",
//   pattern: "^inv_[0-9a-hjkmnp-tv-z]{25}[048cgmrw]$",
//   description: "Branded ID for 'inv'",
//   example: "inv_…",
// }
```

The `pattern` matches the canonical form only (same strings that `is()` accepts
and `generate()` / `wrap()` produce).

**`~standard`** implements [Standard Schema v1](https://standardschema.dev/),
allowing the codec to slot into any validator-aware library (Zod, Valibot,
ArkType, tRPC, Hono) without boilerplate. See [#329](https://github.com/smonn/ids/issues/329)
for the shared validation page.

## Fail-closed verification

Cryptographic verification happens only in `unwrap` / `safeUnwrap`, not in the
structural methods above:

```ts
import { createWrappedKeyId, importWrappingKey, isIdsError } from "@smonn/ids/wrapped";

const key = await importWrappingKey(new Uint8Array(32));
const invoices = createWrappedKeyId("inv", { kind: "u32", keys: [key] });

const result = await invoices.safeUnwrap(req.body.invoiceId);

if (!result.ok) {
  if (result.error === "verification_failed") return 403; // tampered or wrong key
  return 400; // malformed ID
}

const { id, lookupKey } = result; // Id<"inv">, number
```

`unwrap(id)` takes a trusted `Id<Brand>` and **throws** on verification failure;
`safeUnwrap(input)` accepts untrusted input and returns `{ ok: false, error }`
instead.

## Error handling

All throwing paths surface `IdsError` — a single class with a stable `code`
field. Use `isIdsError()` rather than `instanceof`; it survives multiple copies
of the package in one process (the ESM + CJS dual-package hazard). For the full
error-code reference see [#328](https://github.com/smonn/ids/issues/328).

```ts
import { isIdsError } from "@smonn/ids/wrapped";
```

| Code                      | Thrown by                                         |
| ------------------------- | ------------------------------------------------- |
| `invalid_kind`            | `createWrappedKeyId` — kind not `u32/i32/u64/i64` |
| `empty_keyring`           | `createWrappedKeyId` — `keys` array is empty      |
| `duplicate_keyring_entry` | `createWrappedKeyId` — two entries share a secret |
| `invalid_lookup_key`      | `wrap` — key out of range or wrong JS type        |
| `verification_failed`     | `unwrap` — no keyring entry matches the tag       |
| `invalid_id`              | `parse` — string is not a valid ID for the brand  |

```ts
try {
  const lookupKey = await invoices.unwrap(id);
} catch (err) {
  if (isIdsError(err) && err.code === "verification_failed") {
    return 403; // tampered or wrong key
  }
  throw err;
}
```

## Keyring rotation

Pass a non-empty ordered list of wrapping keys. The first is the _current_ key —
the only one `wrap` uses. `unwrap` trials every entry until the tag matches, so
IDs wrapped under any listed key stay unwrappable. Removing an entry revokes all
IDs wrapped under it.

```ts
const rotated = createWrappedKeyId("inv", { kind: "u32", keys: [newKey, oldKey] });
await rotated.unwrap(id); // succeeds — tried oldKey and matched
await rotated.wrap(7); // uses newKey → different public ID
```

## Multiple instances and `allowDuplicateBrand`

The intended pattern is one codec per brand per process. In development
(`NODE_ENV !== "production"`), constructing a second codec for the same brand
emits a one-shot `console.warn`. Pass `allowDuplicateBrand: true` to suppress it
— useful for tests or multi-instance rotation setups:

```ts
const invoicesV2 = createWrappedKeyId("inv", {
  kind: "u32",
  keys: [newKey],
  allowDuplicateBrand: true,
});
```

:::note[Equality leakage]
The codec is deterministic: the same lookup key under the same wrapping key
always yields the same public ID. An observer can tell that two identical public
IDs wrap the same lookup key, but cannot recover the lookup key or wrapping key
from the ID. This is the trade-off for fitting an 8-byte integer lane and an
8-byte verification tag into the 16-byte payload — UUID-sized (128-bit) values
are out of scope for this compact branch. See
[ADR-0009](https://github.com/smonn/ids/blob/main/docs/adr/0009-wrapped-key-compact-construction.md).
:::
