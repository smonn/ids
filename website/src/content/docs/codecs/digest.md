---
title: Digest codec
description: Map caller material to a stable public branded ID — same material always yields the same ID, and the material cannot be recovered from it.
---

The Digest codec maps caller **material** to a stable public ID under one
**Digest key**. The same material always yields the same ID; the material
cannot be recovered from the ID. It is designed for **idempotency keys**,
**content-addressed records**, and **stable public pseudonyms**.

```ts
import { createDigestId, importDigestKey } from "@smonn/ids/digest";

const key = await importDigestKey(new Uint8Array(32));
const idk = createDigestId("idk", { ns: "checkout", key });

const id = await idk.digest("order-ref-123"); // Id<"idk">
const id2 = await idk.digest("order-ref-123"); // same Id<"idk">
```

`digest` is **async** (WebCrypto HMAC). `is`, `parse`, `safeParse`,
`toJsonSchema`, and `~standard` are structural and **sync** — they validate
prefix and base32 shape only, no key required.

## Determinism and equality leakage

The same `(brand, ns, key, material)` tuple always returns the same ID. An
observer without the key can tell that two identical public IDs come from the
same material — but cannot recover that material from the wire form alone.
This is intentional: it is what makes idempotency keys and content addressing
work.

There is **no reverse method** — no `unwrap`, `verify`, or `extractTimestamp`.
The codec is one-way by definition. To check whether material matches a known
ID, re-digest the material and compare IDs directly.

## The `ns` namespace

`ns` is a **required**, non-empty, construction-time string mixed into every
digest. The same material under a different `ns` yields a completely different
ID, so one key can serve multiple unlinkable namespaces without any correlation:

```ts
const emailIds = createDigestId("uid", { ns: "email-pseudonym", key });
const ticketIds = createDigestId("uid", { ns: "support-ticket", key, allowDuplicateBrand: true });

const emailId = await emailIds.digest("user@example.com"); // Id<"uid">
const ticketId = await ticketIds.digest("user@example.com"); // different Id<"uid">
```

`ns` is not on the wire — the brand prefixes the ID, but `ns` is folded into
the digest and never appears in the encoded string. This is what allows two
domains to share a **visible** brand while remaining unlinkable.

An empty or whitespace-only `ns` throws `IdsError` with code
`"invalid_namespace"` at construction.

## Material types

`digest(material)` accepts `string | Uint8Array`. Strings are UTF-8 encoded;
byte arrays are used as-is. The codec does **not** accept or canonicalise
structured objects — callers canonicalise their own data before passing a
string or bytes.

```ts
const str = await idk.digest("hello world");
const bytes = await idk.digest(new TextEncoder().encode("hello world"));
// str === bytes — same ID
```

## Single key, no keyring

The Digest codec holds exactly **one** key — there is no keyring. Two reasons:

- **No tag to trial.** The entire 16-byte payload _is_ the one-way output;
  there is nothing embedded to test a candidate key against.
- **Rotation breaks the contract.** The whole value proposition is a
  _stable-forever map_. Rotating to a new key would silently change every
  future ID for unchanged material, breaking idempotency and content-address
  stability.

Re-keying is a deliberate, breaking operator action — every ID changes.

## Key handling

Import digest key material via `importDigestKey(bytes)` from raw bytes
(16, 24, or 32 bytes — AES-128, AES-192, or AES-256 strength):

```ts
import { importDigestKey, encodeDigestKey, decodeDigestKey } from "@smonn/ids/digest";

// Generate a new key
const raw = crypto.getRandomValues(new Uint8Array(32));
const encoded = encodeDigestKey(raw, "hex"); // store in env / secret manager
const decoded = decodeDigestKey(encoded, "hex");
const key = await importDigestKey(decoded);
```

`encodeDigestKey` / `decodeDigestKey` support `"hex"` (lowercase) and
`"base64url"` formats. The `DigestKey` handle holds a single HMAC-SHA-256
subkey derived via HKDF under the domain label `ids/digest/hmac` —
cryptographically independent from any `OpaqueKey`, `WrappingKey`, or
`SigningKey` derived from the same raw bytes.

## Construction errors

| Code                   | When                                                               |
| ---------------------- | ------------------------------------------------------------------ |
| `invalid_brand`        | Brand is not three lowercase `a–z` characters                      |
| `invalid_namespace`    | `ns` is empty or whitespace-only                                   |
| `invalid_key_length`   | Raw key bytes are not 16, 24, or 32 bytes                          |
| `invalid_key_format`   | Format passed to `encode`/`decode` is not `"hex"` or `"base64url"` |
| `invalid_key_encoding` | Encoded key string is malformed for its format                     |

## Wire methods (sync, no key)

`is`, `parse`, and `safeParse` validate prefix and base32 shape only — no key
required:

```ts
idk.is(id); // true only for canonical Id<"idk"> strings
idk.parse(rawInput); // canonical Id<"idk"> or throws IdsError invalid_id
const result = idk.safeParse(rawInput);
// { ok: true, id } | { ok: false, error: "not_string" | "invalid_prefix" | "invalid_base32" }
```

`safeParse` accepts Crockford visual aliases (`o → 0`, `i → 1`, `l → 1`) and
returns the canonical lowercase form. It rejects IDs whose final base32 character
has non-zero padding bits (code `"invalid_base32"`).

:::note[Equality leakage]
The codec is fully deterministic: the same material under the same key always
yields the same public ID. An observer can tell that two identical IDs come
from the same material, but cannot recover the material or the key from the
wire form. This is the trade-off for idempotency and content addressing — it
is intentional, not a flaw. See
[ADR-0017](https://github.com/smonn/ids/blob/main/docs/adr/0017-digest-codec-construction.md).
:::
