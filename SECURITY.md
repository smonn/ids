# Security Policy

## Supported Versions

Only the current 1.0 release line receives security fixes.

| Version | Supported |
| ------- | --------- |
| 1.0.x   | ✅        |
| < 1.0   | ❌        |

## Threat model & key management

`@smonn/ids` ships four keyed codec variants — **Opaque Timestamp**, **Signed Timestamp**, **Wrapped key**, and **Digest** — each with different security guarantees. This section summarises the properties operators need to understand before deploying keyed IDs in production.

### Entropy floor

All four keyed codecs accept raw key material of 16, 24, or 32 bytes (128, 192, or 256 bits). Every codec derives its primitive key through HKDF under a distinct domain-separation label (`@smonn/ids/opaque/aes`, `@smonn/ids/signed/hmac`, `@smonn/ids/digest/hmac`, `@smonn/ids/wrapped/{aes,hmac}`), so the input size sets the **entropy floor only**: a 16-byte primary secret yields a 128-bit entropy floor even though all derived keys are AES-256 or full-width HMAC-SHA-256 keys.

See [ADR-0019](./docs/adr/0019-hkdf-label-namespace.md) and [ADR-0027](./docs/adr/0027-opaque-hkdf-uniform-key-derivation.md).

### Tag-truncation tradeoffs

The **Signed Timestamp** codec uses a **40-bit (5-byte) truncated HMAC tag**. Wrong-key or tampered IDs false-accept at approximately `keyring_size / 2⁴⁰` per `verify` call — correctness-grade for online verification (an offline attacker cannot trial tags; every guess must reach `verify`), but operators running large keyrings should be aware the margin narrows proportionally.

The **Wrapped key** codec uses a **64-bit (8-byte) truncated HMAC tag**. Its false-accept rate is approximately `keyring_size / 2⁶⁴` per `unwrap` trial.

See [ADR-0012](./docs/adr/0012-signed-timestamp-construction.md) and [ADR-0009](./docs/adr/0009-wrapped-key-compact-construction.md).

### Unauthenticated-Opaque footgun

The **Opaque Timestamp** codec uses unauthenticated AES-CBC (no integrity tag). A **wrong key does not produce an error** — `extractTimestamp` will silently return a meaningless timestamp. The library cannot distinguish a correct key from an incorrect one at decrypt time; the strip-trick reconstruction always yields valid PKCS#7, so no padding oracle is exposed but no verification is possible either.

Operators who need tamper detection or transparent key rotation should use the **Signed Timestamp** codec instead.

See [ADR-0004](./docs/adr/0004-aes-cbc-strip-trick.md) and [ADR-0013](./docs/adr/0013-opaque-key-rotation.md).

### `rng`-determinism caveat

The `rng` option on `createOpaqueTimestampId` (and `createTimestampId`) allows overriding the random-number generator. Overriding with a non-CSPRNG weakens Opaque Timestamp confidentiality and timestamp unpredictability: because the **Opaque Timestamp codec** relies on per-ID randomness in the plaintext (rather than a random IV) to prevent plaintext-equality leakage, a broken or low-entropy RNG allows an observer to correlate ciphertexts produced in the same millisecond.

See [ADR-0004](./docs/adr/0004-aes-cbc-strip-trick.md).

### Key rotation model

**Opaque Timestamp** rotation is **forward-only and caller-tracked**. Because the payload is unauthenticated and the wire carries no key identifier, there is nothing to match a candidate key against; the library cannot trial a ring. Operators hold one codec instance per key epoch and select the matching instance out-of-band. See the **Key epoch** entry in [CONTEXT.md](./CONTEXT.md) and [ADR-0013](./docs/adr/0013-opaque-key-rotation.md) for the full rationale.

The **Signed Timestamp** and **Wrapped key** codecs provide **keyrings** (`keys: [current, ...older]`) for transparent, correctness-grade rotation: verification trials every entry in order until a tag matches. Removing an entry revokes IDs produced under it.

See [ADR-0013](./docs/adr/0013-opaque-key-rotation.md), [ADR-0012](./docs/adr/0012-signed-timestamp-construction.md), and [ADR-0009](./docs/adr/0009-wrapped-key-compact-construction.md).

### One-secret-many-codecs pattern

Because every keyed codec derives its primitive key via HKDF under a distinct domain-separation label, the same raw primary secret may be imported into all four keyed codecs (`importOpaqueKey`, `importSigningKey`, `importWrappingKey`, `importDigestKey`) and each will hold an independently derived key — no cross-codec collision. This is a supported, documented pattern.

See [ADR-0027](./docs/adr/0027-opaque-hkdf-uniform-key-derivation.md).

### Timestamp leakage

The **Timestamp** and **Reverse Timestamp** codecs embed a plaintext creation timestamp in the public ID. Any holder of the ID string can call `extractTimestamp` (or read the first 6 decoded bytes) to recover the millisecond-precision creation time — no key required. Operators who need to hide creation time should use the **Opaque Timestamp** codec.

## Reporting a Vulnerability

Please report security issues **privately** — do not open public issues or pull requests.

**Preferred:** [Open a private advisory on GitHub](https://github.com/smonn/ids/security/advisories/new). This gives us a structured place to discuss impact, draft a fix, and coordinate disclosure.

**Fallback:** Email `security@smonn.se` if you can't use GitHub Security Advisories.

This is a solo-maintained project, so response is best-effort: expect acknowledgement within a few days. Once impact is understood we'll agree on a disclosure timeline together, publish a GitHub Security Advisory, and credit reporters who want it.
