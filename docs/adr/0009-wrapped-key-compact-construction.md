# Wrapped key codec: deterministic 16-byte verified compact wrapping

> **Note (superseded in part).** The HKDF domain-separation labels named here (`@smonn/ids/wrapped/aes/v1`, `@smonn/ids/wrapped/hmac/v1`) were renamed to drop the `/v1` suffix by [ADR-0019](./0019-hkdf-label-namespace.md). The construction below is otherwise unchanged.

The **Wrapped key codec** reversibly wraps a caller-owned integer **Lookup key** into the shared 16-byte wire payload (`<brand>_` + 26 Crockford base32 chars). The compact branch fixes the **Wrapped key byte layout** at 8 bytes of integer lane plus 8 bytes of verification tag, encrypted on the wire as a single AES block via the strip-trick from [ADR-0004](./0004-aes-cbc-strip-trick.md). Cryptographic verification happens in `unwrap` / `safeUnwrap` only — not in `parse`. This is verified compact wrapping, not AEAD.

Construction:

1. **Lane.** Encode the lookup key as an 8-byte big-endian integer lane. `u32` zero-extends into the upper 32 bits; `i32` sign-extends. `u64` / `i64` use the full lane. **Kind** is fixed when the codec is constructed — one brand, one kind, one codec (see [ADR-0007](./0007-wire-indistinguishable-codec-variants.md)).
2. **Tag.** Compute a domain-separated HMAC over the brand, kind, and lane using the wrapping HMAC subkey; truncate to a fixed **64-bit verification tag**.
3. **Plaintext.** `lane ‖ tag` (16 bytes).
4. **Wire.** AES-CBC strip-and-reconstruct encrypt of the plaintext under the wrapping AES subkey; keep `C1` as the 16-byte payload.

`unwrap` decrypts, recomputes the tag, and rejects unless it matches before returning the lane as the lookup key. `wrap` uses the first entry in the **Wrapping keyring**; `unwrap` trials every entry in order until a tag matches.

Operator secret import, subkey derivation, and keyring configuration are implementation details; the **Wrapping key** is a separate secret domain from the **Opaque key** — same `hex` / `base64url` encoded-format conventions, distinct KDF labels so one raw secret cannot silently serve both codecs.

The irreversible **Digest codec** is the one-way counterpart (same deterministic keyed family, different capability). Its construction is a separate decision — this ADR covers Wrapped key only.

## Considered Options

### Naming and vocabulary

- **Lookup key codec** — rejected: overfits the storage use case; loses the explicit one-way vs reversible pairing with **Digest codec**.
- **Encrypted primary key codec** — rejected: implies SQL primary-key semantics; the lookup key is an opaque integer handle whose interpretation is caller-owned.
- **Derived / Deterministic codec** — rejected: describes a shared property (no randomness), not the wrap/unwrap capability.

Public methods are **`wrap` / `unwrap`**, not `encrypt` / `decrypt`. The construction uses AES, but the security story is verified tokenization — not confidentiality-first AEAD.

### Wire and layout

- **Plaintext `lane ‖ tag` on the wire** — rejected: lane bytes would be visible without operator material; obscurity of the lookup key is a deliberate property.
- **UUID-sized lookup keys in the 16-byte branch** — rejected: a 128-bit UUID plus any verification tag cannot fit in 16 bytes. Callers needing UUID wrapping need a different variant or a surrogate integer.
- **Random nonce bits inside the 16-byte payload** — rejected for this branch: every nonce bit comes from the integer lane or the verification tag. A future randomized sibling variant is possible (see Consequences) but is out of scope here.
- **Per-call `kind` instead of construction-time `kind`** — rejected: same brand would admit incompatible lane interpretations of identical wire bytes; conflicts with one-codec-per-brand in [ADR-0007](./0007-wire-indistinguishable-codec-variants.md).

### Cryptography

- **AES-GCM / AEAD** — rejected: a 128-bit authentication tag does not fit alongside a 64-bit integer lane in 16 bytes. Integrity is a truncated HMAC verified after decrypt, not an integrated AEAD tag.
- **AES-CTR with stored nonce** — rejected: expands wire format beyond 16 bytes; breaks the shared payload invariant in [ADR-0002](./0002-payload-layout.md).
- **Reuse Opaque key material without domain separation** — rejected: one operator secret must not silently double as both Opaque Timestamp and Wrapped key material.
- **Wire key-id / version byte for keyring trial** — rejected: same cost as in [ADR-0007](./0007-wire-indistinguishable-codec-variants.md); unwrap trials the configured ring by tag match instead.

### Tag size

- **128-bit tag (full HMAC output)** — rejected: no room for a 64-bit integer lane in 16 bytes.
- **32-bit tag** — rejected: false-accept rate ≈ `keyring_size / 2^32` is too high for correctness-grade unwrap claims.

## Security rationale

### This is not AEAD

`parse` / `safeParse` / `is` validate prefix and base32 only — the same structural contract as every other codec variant. Payload integrity and lookup-key recovery require `unwrap` with **Wrapping key** material. There is no authenticated encryption on the parse path by design: verification is an explicit second step at the application boundary, not an omission.

### Equality leakage (accepted)

The construction is deterministic under fixed wrapping key material: the same lookup key always yields the same public ID. There is no randomness, nonce, or IV in the 16-byte branch. An observer without operator material can tell when two public IDs wrap the same lookup key (identical wire strings) but cannot unwrap them or recover wrapping keys from public IDs alone. This is an accepted trade-off for fitting an 8-byte lane and an 8-byte tag into 16 bytes; the ADR and glossary document it explicitly.

### Fixed 64-bit verification tag

Wrong-key and tamper attempts false-accept at roughly **`keyring_size / 2^64`** per unwrap trial. For a small keyring this is correctness-grade — unlike the Opaque Timestamp codec, where wrong-key decrypt yields a plausible-looking timestamp with no tag to reject ([ADR-0004](./0004-aes-cbc-strip-trick.md)). Keyring trial on unwrap is therefore integrity verification, not plausibility guessing.

### Keyring semantics

The **Wrapping keyring** is a non-empty ordered list of **Wrapping key** entries passed at codec construction. The first entry is **current** — used exclusively by `wrap`. `unwrap` tries every entry in order until the recomputed tag matches. Duplicate operator secrets in the list are rejected at construction. Removing an entry revokes IDs wrapped under it. The same lookup key wrapped under different entries yields different public IDs. No key id is embedded in the wire payload.

### Accepted security trade-offs

**Keyring-index timing leak.** `tryUnwrap` iterates over keyring entries and returns early on the first match, so `unwrap` time leaks the matching key's position in the keyring (i.e. which rotation epoch an ID belongs to). This is an accepted, inherent trade-off of ordered-ring trial. Eliminating the leak would require constant-count trial — decrypting and verifying the HMAC for every keyring entry regardless of match — which is a deliberate design change with latency cost not justified here. The rotation epoch of an ID is low-sensitivity metadata.

## Consequences

- Factory: `createWrappedKeyId(brand, { kind, keys })` on `@smonn/ids/wrapped` per [ADR-0005](./0005-codec-variant-subpath-exports.md). Returns `WrappedKeyCodec<Brand, Kind>` — `kind` is a construction-time literal that drives value types per [ADR-0006](./0006-async-keyed-codec-contract.md) (`u32` / `i32` → `number`; `u64` / `i64` → `bigint`).
- **Keyring shape.** `keys` is `[WrappingKey, ...WrappingKey[]]` (non-empty). First entry is current for `wrap`; all entries are tried on `unwrap`. Duplicate operator secrets throw at construction.
- **Key import.** `importWrappingKey(bytes)` returns `WrappingKey` — an opaque handle holding derived AES and HMAC subkeys, not a bare `CryptoKey`. Helpers parallel Opaque: `encodeWrappingKey` / `decodeWrappingKey` / `importWrappingKey` on the same subpath. Same raw byte lengths as **Opaque key** (16 / 24 / 32).
- **Wrap / unwrap surface.** `wrap(lookupKey)` and `unwrap(id)` are async. `wrap` validates kind width at the boundary (`u32`: safe integers in `[0, 2³²−1]`; no silent truncation). `unwrap(id: Id<Brand>)` trusts the type and throws on verification failure. `safeUnwrap(input: unknown)` structurally parses first, then verifies: success is `{ ok: true, id, lookupKey }`; failure is `{ ok: false, error: ParseError | "verification_failed" }` — tamper, wrong ring, and revoked-key cases are not distinguished.
- **Costs.** `wrap` costs one HMAC + one SubtleCrypto encrypt (strip-trick). `unwrap` costs one decrypt + one HMAC per keyring entry tried (early exit on match).
- **CLI.** Library-first; terminal support (`keygen --wrapped`, `inspect --wrapped`) is a separate follow-up, not the u32 tracer.
- A future **randomized wrapped key** variant could spend payload bits on nonces at the cost of tag strength and determinism; it requires its own ADR and tag-budget analysis.
- **Digest codec** implementation can reuse wrapping-key import patterns but needs a separate ADR for material input shape and length limits.
