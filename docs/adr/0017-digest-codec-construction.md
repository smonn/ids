# Digest codec: one-way keyed deterministic digest, single key, no keyring

> **Note (superseded in part).** The HKDF domain-separation label named here (`ids/digest/hmac`) was renamed to `@smonn/ids/digest/hmac` by [ADR-0019](./0019-hkdf-label-namespace.md). The construction below is otherwise unchanged.

The **Digest codec** maps caller **material** to a stable public ID under one operator secret: the same material always yields the same ID, and the material cannot be recovered from the ID. It is the **irreversible** counterpart to the **Wrapped key codec** ([ADR-0009](./0009-wrapped-key-compact-construction.md)) — same deterministic keyed family, opposite capability (one-way vs. reversible). Constructed via `createDigestId(brand, { ns, key })` on `@smonn/ids/digest` ([ADR-0005](./0005-codec-variant-subpath-exports.md)). It serves idempotency keys, content-addressed records, and stable public pseudonyms.

This is the design-acceptance gate (issue [#101](https://github.com/smonn/ids/issues/101), modeled on the [#60](https://github.com/smonn/ids/issues/60) → [#61](https://github.com/smonn/ids/issues/61) Wrapped key precedent and [ADR-0012](./0012-signed-timestamp-construction.md)); implementation is a separate follow-up.

## Construction

The 16-byte **Payload** is the leftmost 128 bits of a keyed digest over the caller material:

```
payload = HMAC-SHA-256(digestHmacKey, message)[0..16)
message = len32(brand) ‖ brand ‖ len32(ns) ‖ ns ‖ material
```

1. **Primitive.** `HMAC-SHA-256`, truncated to its leftmost 16 bytes. This reuses the truncated-HMAC idiom already accepted for the Signed Timestamp tag ([ADR-0012](./0012-signed-timestamp-construction.md)) and the Wrapped key tag ([ADR-0009](./0009-wrapped-key-compact-construction.md)). Keying is the whole point: a keyless SHA-256 of low-entropy material (an email, a small integer) is trivially brute-forced, so the operator secret is what makes recovery hard for an observer without it.
2. **Message framing.** `brand` and `ns` each carry a fixed 32-bit big-endian byte-length prefix; `material` is the unprefixed trailing remainder. This length framing is load-bearing: it guarantees `ns="a", material="bc"` and `ns="ab", material="c"` produce different messages, so two distinct domains can never collide through naive concatenation.
3. **Truncation.** Take the leftmost 16 bytes of the 32-byte HMAC output (standard HMAC truncation). No folding — for a PRF output, leftmost truncation and XOR-folding are equivalent in strength, and truncation is the simpler, conventional choice.
4. **Encoding.** Encode the 16-byte payload with the same shared canonical encoder every codec uses. The canonical-form constraint of [ADR-0003](./0003-canonical-strict-is.md) (final base32 char's low 2 bits zero) is satisfied **for free**: those 2 bits are base32 padding _beyond_ the 128-bit payload, not payload entropy, so the encoder zeroes them and no digest entropy is lost. The digest emits canonical payloads by construction, like `generate()` on every other codec.

`digest(material)` is the only cryptographic method. There is **no** `unwrap`, no `verify`, no `extractTimestamp` — the codec is one-way by definition. To check whether material matches a known ID, a caller re-digests the material and compares IDs; the codec offers no reverse or verification path because a truncated one-way digest exposes nothing to reverse or trial against.

Per the async-keyed-codec contract ([ADR-0006](./0006-async-keyed-codec-contract.md)): `digest()` is **async** (SubtleCrypto HMAC); the structural wire methods `is`, `parse`, `safeParse`, `toJsonSchema`, `~standard` stay **sync** — they validate prefix and base32 only, identical to every other codec.

## Single key, no keyring (the deliberate divergence)

Every other keyed codec here takes a rotation **keyring** (`{ keys }`) — Wrapped key ([ADR-0009](./0009-wrapped-key-compact-construction.md)), Signed Timestamp ([ADR-0012](./0012-signed-timestamp-construction.md)). The Digest codec deliberately does **not**: it takes a single `{ key }`. Two independent reasons, either sufficient:

- **A keyring is unusable here — there is nothing to trial.** Keyring trial in the other codecs works because the payload carries a _verification tag_ (Wrapped: 64-bit tag inside the decrypted lane; Signed: 40-bit tag in the tail). `unwrap` / `verify` recompute that tag and try each ring entry until one _matches the embedded tag_. A Digest ID has no tag — the entire payload **is** the one-way output, with nothing readable to test a candidate key against. Given only an ID you cannot ask "which key produced this?".
- **A keyring is harmful here — rotation breaks the contract.** The Digest codec's entire value is a _stable forward map_: the same material maps to the same ID forever (idempotency, content-addressing, pseudonyms all depend on this). Rotating to a new "current" key would change every future ID for unchanged material, silently breaking idempotency and content-address stability.

So the Digest codec holds one `DigestKey`. Re-keying is a deliberate, breaking operator action (every ID changes), never an in-band rotation.

## `ns`: invisible, required domain separation

`ns` is a non-secret, construction-time string mixed into the HMAC message. It is **required and non-empty**; an empty or whitespace-only `ns` throws at construction.

`ns` is not redundant with `brand`, because the two separators live on different axes and have different visibility:

- **`brand` is on the wire; `ns` is not.** The brand prefixes the ID (`tok_…`); `ns` is folded into the digest and never appears. This is what makes `ns` necessary for the headline pseudonym use case: two domains can share one **visible** brand (so their IDs look identical and carry no domain hint in the URL) while being **unlinkable**, because the same string under different `ns` yields different IDs. You cannot get invisible separation from brands — brands are public.
- **The codec owns the framing so callers don't hand-roll it.** Without a first-class `ns`, operators would fold domain labels into `material` by string concatenation and reintroduce the exact cross-domain collision the length framing prevents. `ns` is the correct, length-prefixed home for that separation.

`ns` is fixed per codec instance (one `brand` + one `ns` + one `key` = one codec), consistent with one-codec-per-brand ([ADR-0007](./0007-wire-indistinguishable-codec-variants.md)). Because the message framing is part of a stable-forever map, `ns` participation cannot be added later without changing every existing ID — hence it is decided now, not deferred.

## Material

`digest(material)` accepts `material: string | Uint8Array`. Strings are UTF-8 encoded; byte arrays are used as-is. The codec does **not** accept or canonicalise structured objects: silent canonicalisation (sorted-key JSON, number formatting) would bake serialisation rules into the wire contract forever and force every cross-language caller to match them exactly — a quiet way to break the stable-map contract. Callers who digest structured data canonicalise it themselves and pass bytes or a string.

There is no enforced length cap; HMAC streams arbitrary-length input, and cost is proportional to material size.

## Security posture (128 bits truncated)

- **Collision.** A 128-bit output has a birthday bound at ≈ `2⁶⁴`: an accidental same-ID-for-different-material collision needs on the order of `2⁶⁴` distinct inputs _within one `(brand, ns)` space_. This is ample for idempotency keys, content addressing, and pseudonyms.
- **Recovery / preimage — key secrecy is load-bearing.** Without the key, an observer cannot brute-force even very low-entropy material (this is the entire reason for keying over plain SHA-256). _With_ the key, low-entropy material **is** brute-forceable. The Digest codec therefore provides confidentiality of the material _only_ through key secrecy; it is **not** a substitute for protecting low-entropy material against an adversary who holds the key. No claim of preimage resistance independent of input entropy is made.
- **Equality leakage is the intended property, not a flaw.** The map is fully deterministic with no salt or nonce, so the same material always yields the same ID — that is what makes it useful. An observer can tell when two IDs come from the same material (identical wire strings) but, without the key, cannot recover the material. This mirrors the **Wrapped key codec**'s accepted equality leakage ([ADR-0009](./0009-wrapped-key-compact-construction.md)).

Per-material salting/peppering is rejected: a salt makes the map non-deterministic (same material → different ID), which destroys the stable-map purpose entirely.

## How it differs from the other keyed codecs

|  | Digest | Wrapped key | Signed Timestamp |
| --- | --- | --- | --- |
| Capability | one-way (irreversible) | reversible tokenization | integrity over plaintext |
| Reverse path | none (`digest` only) | `unwrap` | `verify` |
| Payload | `HMAC(brand‖ns‖material)[0..16)` | `enc(lane8 ‖ tag8)` | `ts6 ‖ rand5 ‖ tag5` |
| Verification tag | none (whole payload is output) | 64-bit, in payload | 40-bit, in payload |
| Key model | **single key, no keyring** | keyring (trial on `unwrap`) | keyring (trial on `verify`) |
| Determinism | yes (equality leakage) | yes (equality leakage) | no (random tail) |

It is **wire-indistinguishable** from every other codec ([ADR-0007](./0007-wire-indistinguishable-codec-variants.md)): `<brand>_` + 26 base32 chars over a 16-byte payload. The brand registry warns on cross-codec reuse in dev.

## Considered options

- **Keyless SHA-256 truncation** — rejected (issue): low-entropy material is trivially brute-forced; operator key material is the point.
- **HKDF-to-16-bytes, or HMAC then XOR-fold 256→128** — rejected: HKDF is a key-derivation function, not a keyed digest of a message, and adds a round-trip for no benefit; XOR-folding a PRF output is no stronger than leftmost truncation and is non-standard.
- **`ns` folded into key derivation (HKDF info=ns)** — rejected: message-side, length-prefixed `ns` already gives domain separation without a per-namespace KDF step.
- **Dropping `ns` (brand-only framing)** — rejected: brand is on the wire, so it cannot provide _invisible_ separation for unlinkable pseudonyms sharing a prefix; and callers would hand-roll separation via concatenation and create cross-domain collisions.
- **Optional `ns` defaulting to brand** — rejected: the default conflates "I have one domain" with "I forgot to separate domains." Required and non-empty forces a deliberate choice.
- **Accepting structured objects with internal canonicalisation** — rejected: makes serialisation rules a permanent wire contract and a cross-language footgun.
- **A rotation keyring (`{ keys }`)** — rejected: unusable (no tag to trial) and harmful (rotation changes every ID, breaking the stable-map contract).
- **Per-material salt/pepper** — rejected: destroys determinism, which is the whole value proposition.

## Consequences

- New subpath export `@smonn/ids/digest` ([ADR-0005](./0005-codec-variant-subpath-exports.md)): a new `package.json#exports` entry, a `tsdown.config.ts` entry, and `src/digest.ts`. No churn to existing variants.

  > **Correction (2026-06-24):** The codec ships at `src/codecs/digest/index.ts`, not `src/digest.ts`. The [ADR-0018](./0018-by-feature-codec-slices.md) slice refactor relocated every codec constructor into `src/codecs/<name>/index.ts`.

- Factory `createDigestId(brand, { ns, key, allowDuplicateBrand? })` returns `DigestCodec<Brand>`. Async: `digest(material)`. Sync: `is`, `parse`, `safeParse`, `toJsonSchema`, `~standard`. No `unwrap`, `verify`, `extractTimestamp`, `minIdForTime`, or `maxIdForTime`.
- A distinct **Digest key** handle, imported via `importDigestKey(bytes)` from raw material (16 / 24 / 32 bytes), holds a single HMAC-SHA-256 subkey derived through HKDF under the domain-separation label `ids/digest/hmac`. Key helpers parallel Opaque / Wrapped / Signed: `importDigestKey` / `encodeDigestKey` / `decodeDigestKey`, `hex` / `base64url` formats. The label keeps the same raw bytes imported as a `DigestKey` cryptographically independent from a `SigningKey`, `WrappingKey`, or `OpaqueKey`.
- Error codes reuse the existing union ([ADR-0011](./0011-coded-ids-error.md)): `invalid_brand`, `invalid_key_format` / `invalid_key_encoding` / `invalid_key_length`, and a new construction guard for empty `ns`. Whether empty `ns` reuses an existing code or mints one is an implementation-time call deferred to the follow-up issue; it does not reopen any decision here.

  > **Correction (2026-06-24):** The deferred call resolved: `invalid_namespace` shipped as the error code for an empty or whitespace-only `ns`. It is one of the twelve stable codes frozen in [ADR-0011](./0011-coded-ids-error.md) and listed in `CONTEXT.md`.

- `CONTEXT.md` promotes **Digest codec** from sketch to a concrete accepted variant and adds **Digest key** and **Namespace (`ns`)**; **Equality leakage** is generalised to cover both deterministic codecs. `docs/IDEAS.md` strikes through the `createDigestId` sketch and points here.
- README consumer tables and the "choosing a codec variant" row are intentionally left untouched until the codec ships, mirroring [ADR-0012](./0012-signed-timestamp-construction.md), so consumers are not pointed at an unbuildable `@smonn/ids/digest` import.
- Re-keying is an explicit breaking operator action (every ID changes), not an in-band rotation. If a future use case genuinely needs multiple live digest keys, it requires its own ADR and a verification story, because a one-way digest offers nothing to trial.
