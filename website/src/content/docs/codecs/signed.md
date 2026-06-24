---
title: Signed Timestamp codec
description: Tamper-evident, verifiable branded IDs with a readable timestamp — ideal for share links.
---

The Signed Timestamp codec keeps the 48-bit timestamp **readable and sortable**
like the [Timestamp codec](/codecs/timestamp/), but replaces half of the random
tail with a truncated HMAC tag — making IDs **tamper-evident and verifiable
without a database lookup**. This adds **integrity, not confidentiality** — the
opposite security axis from the [Opaque codec](/codecs/opaque/).

The canonical use case is **share links**: embed a Signed Timestamp ID in a URL
and verify it on receipt without a database roundtrip.

```ts
import { createSignedTimestampId, importSigningKey } from "@smonn/ids/signed";

const key = await importSigningKey(new Uint8Array(32));
const shares = createSignedTimestampId("shr", { keys: [key] });

const id = await shares.generate(); // "shr_…", timestamp readable and sortable
shares.extractTimestamp(id); // Date — sync, timestamp is plaintext

await shares.verify(id); // passes; throws IdsError verification_failed on tamper
```

`generate`, `generateAt`, and `verify` are **async** (WebCrypto). `is`, `parse`,
`safeParse`, `extractTimestamp`, `minIdForTime`, `maxIdForTime`, and
`toJsonSchema` stay sync — they work on the wire form only
([ADR-0006](https://github.com/smonn/ids/blob/main/docs/adr/0006-async-keyed-codec-contract.md)).

## Verifying untrusted input

`safeVerify` accepts untrusted input, structurally parses first, then verifies —
without throwing:

```ts
const result = await shares.safeVerify(req.params.shareId);

if (!result.ok) {
  if (result.error === "verification_failed") return 403; // tampered or wrong key
  return 400; // malformed ID
}

const { id } = result; // Id<"shr">, canonical
```

It returns `{ ok: true, id }`, a structural parse error
(`not_string | invalid_prefix | invalid_base32`), or `verification_failed` for a
tag mismatch.

:::note[False-accept bound]
With a signing keyring of `n` entries, an attacker's per-`verify` success
probability is approximately `n / 2⁴⁰`. Verification is online-only — the
signing key lives server-side, so offline guessing is not possible.
:::

## Key handling

Import signing key material via `importSigningKey(bytes)` from raw bytes (16,
24, or 32 bytes). Signing-key material is a **separate secret domain** from
Opaque and Wrapping keys — same `hex` / `base64url` encoding conventions, but a
distinct `SigningKey` handle and HKDF label, so one raw secret cannot silently
serve multiple codecs.

`SigningKey` is an **opaque frozen object** — the underlying non-extractable
`CryptoKey` and a SHA-256 digest of the raw import bytes are held in a
module-internal `WeakMap` and never exposed to callers. The digest enables
constant-time duplicate-keyring detection; neither the raw bytes nor any
recoverable form of the secret persists after import.

```ts
import { encodeSigningKey, decodeSigningKey } from "@smonn/ids/signed";

const encoded = encodeSigningKey(rawBytes, "base64url"); // string
const decoded = decodeSigningKey(encoded, "base64url"); // Uint8Array
```

## Keyring rotation

Pass a non-empty ordered list of signing keys. The first entry is the _current_
key — the only one `generate` / `generateAt` sign with. `verify` / `safeVerify`
trial every entry in order until the tag matches, so IDs signed under any listed
key remain verifiable. Removing an entry revokes all IDs signed under it.

```ts
const oldKey = await importSigningKey(rawOldSecret);
const newKey = await importSigningKey(rawNewSecret);

// After rotation: newKey is current; oldKey is still accepted on verify
const rotated = createSignedTimestampId("shr", { keys: [newKey, oldKey] });
await rotated.verify(id); // succeeds — tried oldKey and matched
await rotated.generate(); // signs with newKey
```

Sentinels from `minIdForTime` / `maxIdForTime` carry no valid HMAC tag — they
exist only for indexed range scans, not as real IDs. See
[ADR-0012](https://github.com/smonn/ids/blob/main/docs/adr/0012-signed-timestamp-construction.md).
