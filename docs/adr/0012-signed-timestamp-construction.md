# Signed Timestamp codec: readable timestamp with a truncated-HMAC integrity tail

The **Signed Timestamp codec** keeps the 6-byte millisecond timestamp **readable and sortable** like the plaintext Timestamp codec, but spends half of the 10-byte random tail on a truncated HMAC so an ID is **tamper-evident and verifiable without a database lookup**. It adds _integrity_, not confidentiality — the opposite axis from the Opaque Timestamp codec. Constructed via `createSignedTimestampId(brand, { keys })` on `@smonn/ids/signed` ([ADR-0005](./0005-codec-variant-subpath-exports.md)).

This is the design-acceptance gate (issue [#100](https://github.com/smonn/ids/issues/100), modeled on the [#60](https://github.com/smonn/ids/issues/60) → [#61](https://github.com/smonn/ids/issues/61) Wrapped key precedent); implementation is the separate blocked [#106](https://github.com/smonn/ids/issues/106).

## Byte layout

Decoding the 16-byte **Payload** yields:

| Bytes      | Field     | Notes                                                            |
| ---------- | --------- | ---------------------------------------------------------------- |
| `[0, 6)`   | timestamp | 48-bit big-endian Unix ms — plaintext, identical to Timestamp    |
| `[6, 11)`  | random    | 40 bits of entropy for same-millisecond uniqueness               |
| `[11, 16)` | tag       | 40-bit truncation of `HMAC-SHA256(hmacKey, brand ‖ ts6 ‖ rand5)` |

The timestamp is never encrypted: `extractTimestamp`, `minIdForTime`, `maxIdForTime`, and lexicographic sort all behave exactly like the plaintext Timestamp codec. The tail is the only departure from the Timestamp byte layout — 5 random bytes plus a 5-byte integrity tag instead of 10 random bytes.

The HMAC covers `brand ‖ timestamp bytes ‖ random bytes` — everything in the ID except the tag itself — so no field can be altered without invalidating the tag.

## Tail budget: 5 random + 5 tag (40 / 40)

The 10-byte tail must carry two unrelated properties out of one 80-bit budget, and they fail in fundamentally different ways:

- **Collision resistance is _unconditional_.** Same brand, same millisecond, two IDs collide iff their **random** fields collide — the tag is a deterministic function of the random bytes and contributes no independent entropy. A collision is a silent correctness bug (two entities, one ID) that occurs by accident purely as a function of write volume; no attacker is involved.
- **Forgery resistance is _conditional and online-only_.** The signing key lives server-side, so an attacker cannot verify tag guesses offline — every forgery attempt is a live `verify` call adjudicated at `2⁻ᵗᵃᵍᵇⁱᵗˢ` each.

A 40-bit (5-byte) tag puts online forgery at ≈ `2⁻⁴⁰` per attempt — at 10⁴ sustained verifications/second, a single expected forgery takes ~1.7 years. A 40-bit random field is birthday-safe to ≈ `2²⁰` (~1M) IDs per millisecond per brand. Spending the marginal byte on collision headroom (which degrades by accident at high volume) rather than forgery margin (which only degrades under an implausible sustained online attack) is the accepted trade. 40 tag bits also clears the 32-bit width [ADR-0009](./0009-wrapped-key-compact-construction.md) rejected as too weak.

**False-accept bound.** With a **Signing keyring** of `n` entries, an attacker's per-`verify` success probability is ≈ `n / 2⁴⁰` (one trial per keyring entry). Small rings stay correctness-grade — this mirrors the Wrapped key codec's `keyring_size / 2⁶⁴`, scaled to the narrower tag.

## Key handling

A distinct **Signing key** handle, imported via `importSigningKey(bytes)` from raw material (16 / 24 / 32 bytes), holds a single HMAC-SHA-256 key derived through HKDF under the domain-separation label `ids/signed-timestamp/hmac`.

- **One primitive, not two.** Unlike the Wrapped key codec — which derives _both_ AES and HMAC subkeys from one secret — the Signed Timestamp codec performs no encryption, so it needs only an HMAC key. The HKDF step exists purely for domain separation, not to split a secret into multiple subkeys (this is why a raw direct import was rejected in favor of a labeled derivation).
- **Separate secret domain.** The signing key is distinct from both the **Opaque key** and the **Wrapping key**: same `hex` / `base64url` encoded-format conventions and raw lengths, but a distinct handle type and a distinct HKDF label. It does **not** reuse the Wrapped key's HMAC subkey. Because the label differs, the same raw bytes imported as a `SigningKey`, `WrappingKey`, or `OpaqueKey` yield cryptographically independent keys — an operator who reuses a secret across codecs (against advice) is still domain-separated.

### Verification keyring

`keys` is a non-empty ordered list `[SigningKey, ...SigningKey[]]`, mirroring the **Wrapping keyring** ([ADR-0009](./0009-wrapped-key-compact-construction.md)):

- The first entry is **current** — the only one `generate` / `generateAt` sign with.
- `verify` / `safeVerify` recompute the tag under each entry in order until one matches; an ID signed under any listed key still verifies.
- Removing an entry revokes IDs signed under it. Duplicate raw secrets are rejected at construction. No key id is on the wire — trial is correctness-grade (tag match), not plausibility guessing.

This gives signed share links a rotation story out of the box, and is the authenticated home that [issue #103](https://github.com/smonn/ids/issues/103) defers transparent try-all-keys verification to.

## API surface

`createSignedTimestampId(brand, { keys, now?, rng?, allowDuplicateBrand? })` returns a `SignedTimestampCodec<Brand>`. Per the async-keyed-codec contract ([ADR-0006](./0006-async-keyed-codec-contract.md)):

- **Async (HMAC):** `generate()`, `generateAt(date)`, `verify(id)`, `safeVerify(input)`.
- **Sync (no key / plaintext timestamp):** `extractTimestamp`, `minIdForTime`, `maxIdForTime`, `is`, `parse`, `safeParse`, `toJsonSchema`, `~standard`.

`verify(id: Id<Brand>)` trusts the type, recomputes the tag across the keyring, and **throws `IdsError` with code `verification_failed`** on mismatch — the same code the Wrapped key codec's `unwrap` throws and the same token `safeUnwrap` returns ([ADR-0011](./0011-coded-ids-error.md)); no new error code is minted. `safeVerify(input: unknown)` structurally parses first, then verifies, returning `{ ok: true, id }` or `{ ok: false, error: ParseError | "verification_failed" }` — the same fail-closed shape as `safeUnwrap`.

`minIdForTime` / `maxIdForTime` build comparison sentinels (`ts(t) ‖ 0x00 × 10` / `ts(t) ‖ 0xff × 10`) exactly like the Timestamp codec. **Bound sentinels are not verifiable** — they carry no valid tag; they exist only for indexed range scans, never as real IDs, the same way the Timestamp codec's bound IDs are never `generate` output.

## How it differs from the other keyed codecs

|               | Signed Timestamp           | Opaque Timestamp                               | Wrapped key                         |
| ------------- | -------------------------- | ---------------------------------------------- | ----------------------------------- |
| Security goal | integrity (tamper-evident) | confidentiality (hide the time)                | reversible tokenization + integrity |
| Timestamp     | readable, sortable         | encrypted, not readable                        | n/a (not timestamp-family)          |
| Crypto        | HMAC tag, no encryption    | AES-CBC, no auth tag                           | AES block + 64-bit HMAC tag         |
| Payload       | `ts6 ‖ rand5 ‖ tag5`       | encrypted `ts6 ‖ rand10`                       | `enc(lane8 ‖ tag8)`                 |
| Verifies?     | yes (`verify`)             | no (wrong key never throws; no padding oracle) | yes (`unwrap`)                      |
| Wrong key     | tag mismatch → rejected    | plausible garbage timestamp                    | tag mismatch → rejected             |

It is **wire-indistinguishable** from the Timestamp, Reverse Timestamp, and Opaque Timestamp codecs ([ADR-0007](./0007-wire-indistinguishable-codec-variants.md)): the wire shape is `<brand>_` + 26 base32 chars over a 16-byte payload. An operator must know which variant a brand uses; the brand registry warns on cross-codec reuse in dev.

## Considered options

### Tail budget

- **0 random / 80-bit tag (fully deterministic)** — rejected: two entities minted in the same millisecond under the same brand would get identical IDs (the tag is a function of brand + timestamp only). Entity IDs need same-ms uniqueness; determinism is a Digest / Wrapped property where the _input_ differs, not appropriate here.
- **2 random / 64-bit tag** — rejected: matches the Wrapped key tag width but leaves only 16 bits of uniqueness (~256 IDs/ms/brand before a likely collision). Forgery is online-only, so the extra tag bits buy resistance against an attacker we don't have at the cost of collisions that happen by accident.
- **6 random / 32-bit tag** — rejected: 32 bits is the exact tag width ADR-0009 rejected as too weak for correctness-grade verification.

### Cryptography

- **Fold integrity into the Opaque Timestamp codec** — rejected: that codec is unauthenticated by design ([ADR-0004](./0004-aes-cbc-strip-trick.md)) and confidential; this variant is the integrity-only, readable-timestamp counterpart. They sit on opposite axes (confidentiality vs integrity) and a brand commits to one.
- **AEAD over the payload** — rejected: a 128-bit auth tag plus a readable 48-bit timestamp does not fit in 16 bytes, and AEAD would also encrypt the timestamp, defeating the readable-and-sortable goal.
- **Sign IDs out-of-band** — rejected: leaves the "verify a share link without a DB row" use case unserved, which is the whole motivation.

### Key handling

- **Reuse the `OpaqueKey` handle / the Wrapped key's HMAC subkey** — rejected: distinct security domains; one raw secret must not silently serve two codecs. A distinct `SigningKey` handle and HKDF label enforce separation.
- **Single `{ key }` instead of a keyring** — rejected: gives signed IDs no rotation path, and `{ key }` → `{ keys }` later is a breaking change. The keyring is the authenticated rotation home #103 points at.

## Consequences

- New subpath export `@smonn/ids/signed` ([ADR-0005](./0005-codec-variant-subpath-exports.md)): a new `package.json#exports` entry, a `tsdown.config.ts` entry, and `src/signed.ts` — no churn to existing variants.
- Key helpers parallel Opaque / Wrapped: `importSigningKey` / `encodeSigningKey` / `decodeSigningKey` on the same subpath, `hex` / `base64url` formats, 16 / 24 / 32-byte raw lengths.
- `verify` throws the existing `verification_failed` `IdsError` code — no addition to the `IdsErrorCode` union ([ADR-0011](./0011-coded-ids-error.md)).
- `CONTEXT.md` promotes **Signed Timestamp codec** to a concrete timestamp-family variant and adds **Signing key** / **Signing keyring**.
- Implementation (#106), consumer docs + the README "choosing a codec variant" row (#116), CLI `--signed` (#113), and bench coverage (#120) follow this acceptance. The README consumer tables are intentionally left untouched until the codec ships (#116) so consumers are not pointed at an unbuildable `@smonn/ids/signed` import.
- A future variant could split the tail budget differently (e.g. a larger tag where same-ms volume is known to be low), but would need its own tag-budget analysis and ADR.
