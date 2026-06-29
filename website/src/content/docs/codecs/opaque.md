---
title: Opaque Timestamp codec
description: Branded IDs whose creation time is AES-encrypted under a key you supply.
---

The [Timestamp codec](/codecs/timestamp/) exposes the creation time by design.
If that's a leak you can't accept — invoice IDs revealing billing cadence,
signup IDs revealing acquisition velocity — the Opaque Timestamp codec keeps the
same `<brand>_<26 chars>` wire shape but **AES-encrypts the payload** under a key
you supply. This adds **confidentiality, not integrity** — the opposite axis
from the [Signed Timestamp codec](/codecs/signed/).

```ts
import { createOpaqueTimestampId, importOpaqueKey } from "@smonn/ids/opaque";

const key = await importOpaqueKey(new Uint8Array(16)); // an OpaqueKey handle
const invoices = createOpaqueTimestampId("inv", { key });

const id = await invoices.generate(); // "inv_…", timestamp not extractable without the key
await invoices.extractTimestamp(id); // Date — same key required
```

> **Important — unauthenticated decryption:** `extractTimestamp` **never throws**
> on a wrong or tampered key. A mismatched key decrypts silently to a plausible
> but incorrect `Date`. This is the opposite of the [Signed Timestamp codec](/codecs/signed/),
> whose `verify` throws `verification_failed` on tag mismatch. If you need
> tamper-evident IDs, use the Signed Timestamp codec instead.

## `importOpaqueKey`

`importOpaqueKey(bytes)` is **async** and returns an opaque `OpaqueKey` handle —
not a raw `CryptoKey`. The underlying `CryptoKey` is held internally and is never
exposed to callers.

The bytes are HKDF **input keying material**, not the AES key itself: the codec
derives an **AES-256** key from them via HKDF under the label
`@smonn/ids/opaque/aes` ([ADR-0027](https://github.com/smonn/ids/blob/main/docs/adr/0027-opaque-hkdf-uniform-key-derivation.md)).
Accepts **16, 24, or 32 bytes**; the input size sets the entropy floor only —
every handle yields AES-256, and a 16-byte handle carries a 128-bit entropy
floor:

```ts
const key128 = await importOpaqueKey(new Uint8Array(16)); // AES-256, 128-bit entropy floor
const key192 = await importOpaqueKey(new Uint8Array(24)); // AES-256, 192-bit entropy floor
const key256 = await importOpaqueKey(new Uint8Array(32)); // AES-256, 256-bit entropy floor
```

Any other byte length throws `invalid_key_length`.

Because the key is HKDF-derived under a codec-specific label, the same raw secret
may safely serve every keyed codec — a **primary secret**. Each codec still needs
its own explicit import.

## Storing key material

`encodeOpaqueKey` / `decodeOpaqueKey` round-trip raw bytes to and from `hex` or
`base64url` strings for storage in env vars or secret managers. The `format`
argument is **required** and must match between encode and decode:

```ts
import { encodeOpaqueKey, decodeOpaqueKey } from "@smonn/ids/opaque";

const raw = new Uint8Array(32); // 32 bytes of key material
const encoded = encodeOpaqueKey(raw, "hex"); // "0000…" (64 hex chars)
const decoded = decodeOpaqueKey(encoded, "hex"); // back to Uint8Array
// decoded is identical to raw

// base64url is also valid:
const b64 = encodeOpaqueKey(raw, "base64url");
const raw2 = decodeOpaqueKey(b64, "base64url");
```

The [CLI](/cli/) `keygen` command emits keys in this format.

## `generateAt` validation

`generateAt(date)` rejects invalid input and throws an `IdsError` with
`code: "invalid_timestamp"`:

- **negative timestamp** — `date.getTime() < 0`
- **non-integer timestamp** — `date.getTime()` is a float (e.g. `1.5`)
- **timestamp exceeds 48-bit range** — `date.getTime() >= 2 ** 48`
- **`Invalid Date`** — `date.getTime()` is `NaN`

Use `isIdsError` from `@smonn/ids` to catch it — `instanceof Error` alone matches
but does not discriminate the code:

```ts
import { isIdsError } from "@smonn/ids";

try {
  const id = await invoices.generateAt(date);
} catch (err) {
  if (isIdsError(err) && err.code === "invalid_timestamp") {
    // date is invalid — negative, non-integer, out of range, or Invalid Date
  }
  throw err;
}
```

## Testing

Inject a fixed `now`, a no-op `rng`, and a key from constant bytes for
reproducible ciphertext; `generate` and `extractTimestamp` are async. See the
[Testing guide](/testing/) for the full pattern.

## Differences from the Timestamp codec

- **Async key-dependent methods.** WebCrypto is async-only, so `generate`,
  `generateAt`, and `extractTimestamp` return `Promise`s. `is`, `parse`,
  `safeParse`, `toJsonSchema`, and the Standard Schema adapter stay sync — they
  work on the wire form only.
- **No `minIdForTime` / `maxIdForTime`.** Encrypted payloads don't sort by time.
  Store the timestamp in a separate column if you need time-range scans.
- **Wire-indistinguishable from the Timestamp codec.** Codec choice is a
  per-brand commitment.

Encryption is AES-CBC with a zero IV — deliberately safe here because the
plaintext already carries 80 bits of entropy per ID
([ADR-0004](https://github.com/smonn/ids/blob/main/docs/adr/0004-aes-cbc-strip-trick.md)).

## Rotating the Opaque key

Rotation is **forward-only and caller-tracked** — the codec deliberately has no
key ring. The key feeds only `generate` and `extractTimestamp`; `parse`,
`safeParse`, `is`, and `toJsonSchema` never touch it, so rotating forward is
nearly free: point new writes at a new key and keep the old key only to read old
IDs' timestamps.

Because the payload is unauthenticated and carries no key id, the library
**cannot** trial a ring to pick the right key — a wrong key yields a plausible
but wrong timestamp, never an error. You hold one codec per _key epoch_ and
select it from your own records.

When two codec instances share the same brand (as in the multi-epoch pattern
below), pass `allowDuplicateBrand: true` on every non-current (retired) instance.
This suppresses the dev-only cross-codec warning that fires when multiple codec
instances register the same brand — a warning that normally signals a mistake,
but here is intentional:

```ts
// Import raw key bytes and produce OpaqueKey handles first.
const keyV1 = await importOpaqueKey(new Uint8Array(16).fill(0x01)); // retired key
const keyV2 = await importOpaqueKey(new Uint8Array(16).fill(0x02)); // current key

// One codec instance per key epoch. You — not the library — track which epoch
// minted each ID. The epoch CANNOT be read from the ID itself.
const codecs = new Map([
  [1, createOpaqueTimestampId("inv", { key: keyV1, allowDuplicateBrand: true })], // retired
  [2, createOpaqueTimestampId("inv", { key: keyV2 })], // current — no flag needed
]);

const id = await codecs.get(2)!.generate(); // new IDs use the current epoch's key

// Reading an old ID: look up its epoch from your records, pick that codec.
const epoch = await db.keyEpochFor(someOldId);
await codecs.get(epoch)!.extractTimestamp(someOldId);
```

If you need transparent, correctness-grade rotation where a wrong key is
_rejected_, that's the [Signed Timestamp codec](/codecs/signed/)'s job — its
HMAC tag gives a verifiable ring. The Opaque codec trades that away for
confidentiality. See
[ADR-0013](https://github.com/smonn/ids/blob/main/docs/adr/0013-opaque-key-rotation.md).
