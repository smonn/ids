# Key-handle memory posture: no raw-secret retention; digest-backed keyring equality

Keyed codec handles (`SigningKey`, `WrappingKey`) derive non-extractable `CryptoKey` objects via HKDF during import. Non-extractable keys are held by the WebCrypto runtime in memory the JS heap cannot observe directly — this is the deliberate security property. Prior to this ADR, both `importSigningKey` and `importWrappingKey` stored `bytes.slice()` — a copy of the caller's raw operator secret — in the handle's WeakMap internals alongside those derived keys. That copy was read by exactly one consumer: the `signingKeysEqual` / `wrappingKeysEqual` comparators that power keyring duplicate-detection at codec construction. After construction the copy was never read again, yet it lived for the handle's lifetime. Handles are typically module-global singletons, so the retention was effectively process-lifetime.

**The raw-bytes copy reintroduced the very exposure that the non-extractable `CryptoKey` design eliminates.** An in-process attacker (e.g. a deserialised closure, a memory-disclosure bug, or a supply-chain compromise with heap read access) could recover the raw operator secret from the WeakMap without ever touching a `CryptoKey`.

**Decision.** On `import*`, compute `SHA-256(rawBytes)` via `crypto.subtle.digest` and store the 32-byte digest in place of the raw bytes. The comparators then compare digests with the same constant-time loop. Once the caller drops its own reference, the raw secret is collectable; only the non-recoverable digest and non-extractable `CryptoKey` values persist.

The Opaque handle (`OpaqueKey`) is unchanged — it retains no raw bytes and has no keyring, making it the prior-art reference this change brings the other handles into alignment with.

## Trade-off: plain SHA-256, no salt or domain separation

Duplicate detection requires that two handles imported from **identical** secrets produce **identical** digests — only then can the comparator correctly identify the duplicate. A keyed hash (HMAC) or a salted digest would break this invariant: the salt stored in handle A would differ from the salt in handle B, making equal secrets look unequal.

Plain SHA-256 is therefore the right primitive. This is safe because:

- The digest **never leaves the process** — it is stored in a WeakMap entry that is not serialised, logged, or exported. No oracle is available to an external attacker.
- The input is a **high-entropy operator secret** (128, 192, or 256 raw random bits). An adversary who can observe the digest cannot brute-force the preimage without ~2¹²⁸ evaluations at minimum.
- The purpose of the digest is **equality detection, not authentication or key derivation** — the security bar is that equal secrets produce equal digests (for correctness) and that the digest does not recover the secret (for posture). SHA-256 satisfies both.

## Considered options

- **SHA-256(rawBytes), plain — ACCEPTED.** Identical secrets produce identical digests (correctness preserved), digest is non-recoverable (posture improved), no new dependency, one extra SubtleCrypto call per import (negligible — import is already async and HKDF-bound).

- **Retain `rawBytes` — rejected (status quo ante).** Correct for duplicate detection but retains the recoverable secret in the JS heap for the handle lifetime, undermining the non-extractable `CryptoKey` design.

- **HMAC or salted digest — rejected.** Breaks the equality invariant: equal secrets with different salts/keys produce different digests, making duplicate detection impossible.

- **Keep only the derived CryptoKeys; use `subtle.sign` for equality — rejected.** WebCrypto does not expose a constant-time `CryptoKey` equality primitive, and comparing HMAC outputs over a nonce would require an async comparator and a protocol change. The digest approach is simpler, synchronous, and has equivalent security properties for this use case.

## Consequences

- `signingKeysEqual` and `wrappingKeysEqual` are synchronous and behaviorally unchanged: they return `true` iff the two handles were imported from the same raw material.
- The length-guard branch (`if (a.length !== b.length)`) is removed from both comparators because `SHA-256` always produces 32 bytes — the lengths are always equal by construction.
- No raw operator secret is retained past `import*`. The only persistent state per handle is the 32-byte SHA-256 digest and the non-extractable derived `CryptoKey` values.
- No API, wire-format, or CLI change. `signingKeysEqual` / `wrappingKeysEqual` are module-internal and not re-exported from `@smonn/ids/signed` or `@smonn/ids/wrapped`.
- No changeset required — the change is invisible to consumers.
