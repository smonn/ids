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

const u32Ids = createWrappedKeyId("inv", { kind: "u32", keys: [key] });
const id = await u32Ids.wrap(42); // number → Id<"inv">
const lookupKey = await u32Ids.unwrap(id); // → 42 (number)
```

`wrap`, `unwrap`, and `safeUnwrap` are **async** (WebCrypto). `is`, `parse`, and
`safeParse` are structural and sync.

## Integer kinds and value types

The 32-bit kinds (`u32`, `i32`) use safe JavaScript `number` values. The 64-bit
kinds (`u64`, `i64`) always use `bigint` — even when the magnitude would fit in a
`number` — to prevent silent truncation or sign erasure.

| Kind | JS type | Range |
| --- | --- | --- |
| `u32` | `number` | `[0, 4294967295]` |
| `i32` | `number` | `[-2147483648, 2147483647]` |
| `u64` | `bigint` | `[0n, 18446744073709551615n]` |
| `i64` | `bigint` | `[-9223372036854775808n, 9223372036854775807n]` |

```ts
const orders = createWrappedKeyId("ord", { kind: "u64", keys: [key] });
const id = await orders.wrap(42n); // bigint → Id<"ord">
const key64 = await orders.unwrap(id); // → 42n (bigint)
```

## Fail-closed verification

`is`, `parse`, and `safeParse` are structural — prefix and base32 shape only, no
key required. Cryptographic verification happens only in `unwrap` / `safeUnwrap`:

```ts
const result = await invoices.safeUnwrap(req.body.invoiceId);

if (!result.ok) {
  if (result.error === "verification_failed") return 403; // tampered or wrong key
  return 400; // malformed ID
}

const { id, lookupKey } = result; // Id<"inv">, number | bigint
```

`unwrap(id)` takes a trusted `Id<Brand>` and **throws** on verification failure;
`safeUnwrap(input)` accepts untrusted input and returns `{ ok: false, error }`
instead.

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

:::note[Equality leakage]
The codec is deterministic: the same lookup key under the same wrapping key
always yields the same public ID. An observer can tell that two identical public
IDs wrap the same lookup key, but cannot recover the lookup key or wrapping key
from the ID. This is the trade-off for fitting an 8-byte integer lane and an
8-byte verification tag into the 16-byte payload — UUID-sized (128-bit) values
are out of scope for this compact branch. See
[ADR-0009](https://github.com/smonn/ids/blob/main/docs/adr/0009-wrapped-key-compact-construction.md).
:::
