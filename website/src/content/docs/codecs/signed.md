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
probability is approximately `n / 2⁴⁰`. Verification is online-only **when the
signing key stays server-side** — that is an operational assumption, not a codec
guarantee; the codec HMAC-verifies regardless of where the key lives.
:::

## `verify` and `extractTimestamp` trust contracts

`verify(id: Id<Brand>)` trusts the `Id<Brand>` static type and does not
structurally validate. For untrusted input, route through `safeVerify` or
`safeParse` first:

```ts
// Untrusted input — use safeVerify (or safeParse then verify)
const result = await shares.safeVerify(req.params.shareId);

// Already-typed Id<"shr"> — verify trusts the type
await shares.verify(id); // throws IdsError verification_failed on tag mismatch
```

`extractTimestamp(id: Id<Brand>)` reads the **plaintext timestamp bytes without
verifying the HMAC tag**. A tampered ID returns a timestamp without raising an
error — the decoded bytes are structurally valid milliseconds regardless of
integrity. Always verify first if the source is untrusted:

```ts
const result = await shares.safeVerify(req.params.shareId);
if (!result.ok) {
  if (result.error === "verification_failed") return 403;
  return 400;
}

// Safe: id was verified before extractTimestamp is called
const ts = shares.extractTimestamp(result.id);
```

## Constructor options

`createSignedTimestampId(brand, opts)` accepts:

| Option                | Type                            | Default                  | Purpose                                                                                                                                   |
| --------------------- | ------------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `keys`                | `[SigningKey, ...SigningKey[]]` | _(required)_             | Non-empty ordered signing keyring                                                                                                         |
| `now`                 | `() => number`                  | `Date.now`               | Returns the current timestamp in milliseconds; inject in tests to control time                                                            |
| `rng`                 | `(target: Uint8Array) => void`  | `crypto.getRandomValues` | Writes 5 random bytes into `target` for the random tail; inject in tests for deterministic output                                         |
| `allowDuplicateBrand` | `boolean`                       | `false`                  | Silences the duplicate-brand warning in non-production environments (e.g. for holding multiple codec instances during key rotation tests) |

## Key handling

Import signing key material via `importSigningKey(bytes)` from raw bytes (16,
24, or 32 bytes). `SigningKey` is an **opaque frozen object** — the underlying
`CryptoKey` is held in a module-internal `WeakMap` and is never exposed to
callers. This prevents raw-secret retention in the JS heap from undermining
the non-extractable `CryptoKey` design.

Signing-key material is a **separate secret domain** from Opaque and Wrapping
keys — same `hex` / `base64url` encoding conventions, but a distinct `SigningKey`
handle and HKDF label, so one raw secret cannot silently serve multiple codecs.

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

## Error handling

All errors are `IdsError` instances with a stable `code` field. Use `isIdsError`
(re-exported from `@smonn/ids/signed`) to discriminate them:

```ts
import { createSignedTimestampId, importSigningKey, isIdsError } from "@smonn/ids/signed";
```

**Construction errors** — thrown by `createSignedTimestampId`:

| Code                      | Thrown when                                     |
| ------------------------- | ----------------------------------------------- |
| `empty_keyring`           | `keys` array is empty                           |
| `duplicate_keyring_entry` | Two entries in `keys` share the same raw secret |

**Key helper errors** — thrown by `importSigningKey`, `encodeSigningKey`, `decodeSigningKey`:

| Code                   | Thrown when                                       |
| ---------------------- | ------------------------------------------------- |
| `invalid_key_length`   | Raw key bytes are not 16, 24, or 32 bytes         |
| `invalid_key_format`   | `format` argument is not `"hex"` or `"base64url"` |
| `invalid_key_encoding` | Encoded string is malformed for its format        |

**Verification error** — thrown by `verify`:

| Code                  | Thrown when                                |
| --------------------- | ------------------------------------------ |
| `verification_failed` | No keyring entry's HMAC tag matches the ID |

Example error-handling pattern:

```ts
try {
  await shares.verify(id);
} catch (err) {
  if (isIdsError(err) && err.code === "verification_failed") {
    // tampered ID or wrong keyring
  }
  throw err;
}
```

Construction and key-import errors are thrown synchronously. For example, passing an empty `keys` array throws immediately with code `empty_keyring`.
