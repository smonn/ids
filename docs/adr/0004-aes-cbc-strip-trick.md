---
status: accepted
created: 2026-06-03
last-updated: 2026-06-27
---

# Opaque Timestamp codec: AES-CBC with strip-and-reconstruct

`createOpaqueTimestampId` needs a 128-bit permutation under a key, encoded into the same 16-byte payload as every other codec. WebCrypto exposes no raw single-block AES — every mode either pads (CBC: +16B), authenticates (GCM: +16B tag), wraps (KW: +8B), or streams in a way that's not a permutation (CTR). We use AES-CBC with a zero IV and exploit PKCS#7's full-padding-block property: encrypting a 16-byte plaintext produces a 32-byte ciphertext `C1 ‖ C2` where `C2 = AES_K(0x10×16 XOR C1)`. We keep only `C1` on the wire; to decrypt, we recompute `C2` via a second CBC encrypt of `0x10×16 XOR C1`, then run CBC decrypt on the reconstructed 32-byte ciphertext.

## Considered Options

- **AES-CTR with fixed counter** — rejected: degenerates to a one-time pad (same key, same mask, leaks plaintext structure across IDs).
- **AES-CTR with per-ID nonce stored alongside** — rejected: expands wire format beyond 16 bytes; breaks the shared payload invariant.
- **AES-GCM** — rejected: 16-byte authentication tag expands wire format. Integrity is `createSignedTimestampId`'s job (see [docs/IDEAS.md](../IDEAS.md)).
- **AES-KW** — rejected: adds an 8-byte integrity check; expands to 24 bytes.
- **Pure-JS AES implementation** — rejected: bundle weight (~5–10KB), implementation review burden, no clear benefit over the strip-trick for a low-throughput async codec. Reconsider if a sync keyed contract is ever required.

## Security rationale: IV=0 is safe here

With a zero IV, our 16-byte ciphertext is exactly `AES_K(plaintext)` — a single-block PRP under the key. We are not really using "CBC with IV=0" semantically; CBC mode is the WebCrypto vehicle that lets us compute raw single-block AES, and the strip-trick is mechanical plumbing for that.

CBC's IV-must-be-random requirement exists to address two failure modes that don't apply to this construction:

- **Repeated plaintexts visible in ciphertext.** Random IVs mask plaintext equality. Our plaintext is 6B timestamp ‖ 10B random — 80 bits of per-ID entropy already live inside the plaintext, doing the work an IV would normally do. Two distinct IDs colliding in plaintext requires same millisecond + same 80-bit random; the birthday bound is ~2⁴⁰ IDs per millisecond, which is not a thing.
- **Patterns across blocks.** CBC chains C\_{i-1} into block i specifically to break repeated-block patterns in multi-block messages. Single-block payload, no other blocks.

Accepted residual costs:

- **Determinism is technically visible.** Identical plaintexts produce identical ciphertexts. Practically impossible given the 80-bit random tail, but a tiny information leak that random IV would hide.
- **Low-entropy `rng` footgun.** A deterministic or broken `rng` would expose plaintext equality where random IV would mask it. Not a meaningful risk with the default RNG.
- **Not IND-CPA in the formal sense.** Deterministic encryption is only IND-CPA secure when plaintexts come from a high-entropy distribution. Ours does, so this is satisfied operationally but not categorically.

The alternative (random IV stored alongside ciphertext) would expand the wire format to 32 bytes, breaking the shared payload invariant in [ADR-0002](./0002-payload-layout.md) and the migration story in [ADR-0007](./0007-wire-indistinguishable-codec-variants.md). For a single-block, high-entropy plaintext under a PRP, the security gain does not justify the wire-format cost.

Birthday bound on the 128-bit ciphertext space (~2⁶⁴ IDs before collisions become probable) is far beyond any plausible application throughput. AES-256 keys don't change this — block size is 128 bits regardless of key size.

> **Correction (2026-06-27):** The "you supply the AES key" / operator-chosen key-size model this ADR describes (the key paragraph above, and the `importOpaqueKey` consequence below) is superseded. Per [ADR-0027](./0027-opaque-hkdf-uniform-key-derivation.md), `importOpaqueKey` now treats its bytes as HKDF input keying material (IKM), not the AES key directly — it derives the encryption key via HKDF-Expand under the label `@smonn/ids/opaque/aes`. Input size (16/24/32 bytes) sets the entropy floor only; Opaque now **always derives an AES-256 key**, so the operator no longer picks AES-128/192/256. The strip-and-reconstruct mechanics are unchanged — the single-block trick is indifferent to key size.

## Consequences

- `generate` / `generateAt` cost one SubtleCrypto encrypt call.
- `extractTimestamp` costs two SubtleCrypto calls (compute `C2`, then decrypt). The constructed `C2` always produces valid PKCS#7 padding, so the decrypt never throws on a structurally-valid input.
- The `CryptoKey` must be imported for `AES-CBC` with usages `["encrypt", "decrypt"]`. The `importOpaqueKey` helper handles this.
- Tampered or wrong-key input decrypts to garbage bytes without error. `extractTimestamp` returns an arbitrary `Date`, consistent with the existing trust-the-type contract (see [ADR-0002](./0002-payload-layout.md)). Integrity belongs to a future Signed Timestamp codec, not here.
