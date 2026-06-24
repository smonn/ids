# IDs

Library for generating, parsing, and validating public-facing entity IDs in TypeScript apps. IDs are k-sortable by creation time, type-safe at compile time, and tolerant of human transcription (case + visually-ambiguous characters).

## Language

**Brand**:
The string that identifies an entity type (e.g. `"usr"`, `"org"`). Exists simultaneously at runtime (the literal characters embedded at the start of every ID) and at the type level (the nominal tag on `Id<Brand>` that prevents cross-type assignment). One concept, two materialisations — the runtime brand IS the type-level brand.
_Avoid_: prefix, tag (overloaded with HTML/hashtag), type code, object prefix, resource prefix.

**Prefix**:
The brand plus the trailing separator — `"usr_"`. Distinct from the brand itself: the brand is `"usr"`, the prefix is what actually appears at the start of an encoded ID.
_Avoid_: brand (use **Brand** for the unsuffixed form), header.

**Codec**:
The brand-scoped object that generates, parses, and validates IDs for one entity type. The brand is validated once at construction; the prefix is captured by each method. One codec per brand, typically constructed at module init. Concrete codecs are **Codec variants**.
_Avoid_: factory, generator, encoder.

**IdCodec**:
The minimum structural interface required by web and ORM adapters — a subset of **Codec**. Any codec variant satisfies this because all expose `safeParse`. Adapters only ever call `safeParse`; they never call key-dependent methods like `extractTimestamp`, `wrap`, or `unwrap`. Internal to the adapter layer; `IdCodec` itself is not a public package export, but the public API surface re-exports this shape via the `IdColumnCodec` alias from `@smonn/ids/drizzle`, `@smonn/ids/prisma`, and `@smonn/ids/kysely`. Distinct from **Codec** (the full brand-scoped object with all methods).
_Avoid_: codec interface (use **IdCodec** for precision), partial codec.

**Codec variant**:
A concrete codec algorithm sharing the same wire shape (`<brand>_` + 26 Crockford base32 chars) but differing in byte layout and capabilities. Current shipped variants: the **Timestamp codec** (see [ADR-0002](./docs/adr/0002-payload-layout.md)), **Opaque Timestamp codec** (see [ADR-0004](./docs/adr/0004-aes-cbc-strip-trick.md)), **Reverse Timestamp codec** (see [ADR-0010](./docs/adr/0010-reverse-timestamp-inversion.md)), **Wrapped key codec** (see [ADR-0009](./docs/adr/0009-wrapped-key-compact-construction.md)), **Signed Timestamp codec** (see [ADR-0012](./docs/adr/0012-signed-timestamp-construction.md)), and **Digest codec** (see [ADR-0017](./docs/adr/0017-digest-codec-construction.md)). Each variant is a separate subpath export — see [ADR-0005](./docs/adr/0005-codec-variant-subpath-exports.md).
_Avoid_: default codec (use **Timestamp codec** for the dominant variant), trust mode, algorithm.

**Timestamp-family codec**:
A codec variant whose payload represents an ID creation timestamp, either readable directly or recoverable only under key. Current members are the **Timestamp codec**, **Opaque Timestamp codec**, **Reverse Timestamp codec**, and **Signed Timestamp codec** — see [ADR-0012](./docs/adr/0012-signed-timestamp-construction.md).
_Avoid_: timestamp layout (use **Timestamp byte layout** for the plaintext byte split), time codec, chronological codec.

**Timestamp codec**:
The dominant timestamp-family codec variant. Payload carries the **Timestamp byte layout** in plaintext — IDs sort by creation time and `extractTimestamp` works without a key. Constructed via `createTimestampId(brand)` on the main entry; fully synchronous.
_Avoid_: default codec, standard codec, ULID codec, createId.

**Opaque Timestamp codec**:
A timestamp-family codec variant that AES-encrypts the payload under caller-supplied **Opaque key** material. Same wire shape as the Timestamp codec, but the timestamp is not readable from the ID without the key. `generate` and `extractTimestamp` are key-dependent; parsing methods work on the wire form only — see [ADR-0006](./docs/adr/0006-async-keyed-codec-contract.md). No time-range bound methods (`minIdForTime` / `maxIdForTime`) — encrypted payloads do not sort by creation time. Constructed via `createOpaqueTimestampId(brand, { key })`.
_Avoid_: Opaque codec, encrypted codec, private codec, secure codec, createOpaqueId.

**Reverse Timestamp codec**:
A timestamp-family codec variant whose 48-bit timestamp field is bitwise-inverted before encoding (`~ts & 0xFFFFFFFFFFFF`), so IDs sort in **descending** (newest-first) lexicographic order. `extractTimestamp` inverts the timestamp bytes back to recover the original millisecond. No key material required — the inversion is a deterministic byte transform; `generate` and `extractTimestamp` are fully synchronous. Provides `minIdForTime` / `maxIdForTime` with reversed bound semantics: a newer timestamp maps to a smaller ID, so a time-range scan over [t_old, t_new] uses `minIdForTime(t_new)` as the lower bound and `maxIdForTime(t_old)` as the upper bound. Constructed via `createReverseTimestampId(brand)` from `@smonn/ids/reverse`. See [ADR-0010](./docs/adr/0010-reverse-timestamp-inversion.md).
_Avoid_: descending codec, inverted codec, reverse-sort codec, createDescendingId.

**Signed Timestamp codec**:
A timestamp-family codec variant that keeps the 48-bit timestamp **readable and sortable** like the **Timestamp codec** but replaces half the random tail with a truncated HMAC, making an ID tamper-evident and verifiable without a database lookup. The **Byte layout** is 6 plaintext timestamp bytes followed by 5 random bytes and a 5-byte (40-bit) tag — a truncation of HMAC-SHA-256 over `brand ‖ timestamp ‖ random`. Adds **integrity, not confidentiality** — the opposite axis from the **Opaque Timestamp codec**. `generate` / `generateAt` / `verify` / `safeVerify` are async and key-dependent; `extractTimestamp`, `minIdForTime` / `maxIdForTime`, and the structural wire methods stay sync. `verify` throws **IdsError** `verification_failed` on tag mismatch; `safeVerify` structurally parses then verifies without throwing. Wrong-key/tamper false-accept is bounded by `keyring_size / 2⁴⁰` per verify. Constructed via `createSignedTimestampId(brand, { keys })` from `@smonn/ids/signed`. See [ADR-0012](./docs/adr/0012-signed-timestamp-construction.md).
_Avoid_: signed codec (ambiguous with numeric sign), authenticated timestamp codec, HMAC codec, tamper-proof codec (it is tamper-_evident_, not tamper-proof).

**Opaque key**:
An imported handle (`OpaqueKey`) that gates encryption and decryption in the Opaque Timestamp codec. Obtained via `importOpaqueKey(bytes)` from raw AES material (128, 192, or 256 bits); the underlying `CryptoKey` is held internally and never exposed. Distinct from the ID **Payload** — an Opaque key is operator-supplied secret material, never embedded in an ID. `extractTimestamp` requires the same key that was used at generation time. Rotation is forward-only and caller-tracked, not a library-trialled ring — see **Key epoch** and [ADR-0013](./docs/adr/0013-opaque-key-rotation.md). Parallels the **Wrapping key** handle pattern; one raw secret must not serve both codecs without an explicit import.
_Avoid_: secret, encryption key (too generic), master key, bare `CryptoKey` (use the `OpaqueKey` handle).

**Key epoch**:
The window during which one **Opaque key** was current. Because the Opaque Timestamp codec is unauthenticated ([ADR-0004](./docs/adr/0004-aes-cbc-strip-trick.md)) and wire-indistinguishable with no key id ([ADR-0007](./docs/adr/0007-wire-indistinguishable-codec-variants.md)), rotation is **forward-only and caller-tracked**, never a library-trialled ring: `generate` encrypts under the single key its codec instance holds, and reading an old ID's timestamp needs the key from that ID's epoch. The caller records which epoch minted each ID **out-of-band** — a key-epoch column, a tenant→key map, a created-at cutover — because the epoch **cannot** be recovered from the ID itself (the timestamp is unreadable without the key, and the wire carries no marker). Operators hold one codec instance per epoch (`Map<epoch, OpaqueTimestampCodec>`, the non-current instances passing `allowDuplicateBrand: true`) and select the matching instance to call `extractTimestamp`. For transparent, correctness-grade try-all-keys rotation, use the **Signed Timestamp codec**'s **Signing keyring** instead ([ADR-0012](./docs/adr/0012-signed-timestamp-construction.md)). See [ADR-0013](./docs/adr/0013-opaque-key-rotation.md).
_Avoid_: Opaque keyring (there is no library-trialled ring on this codec — that framing implies transparent rotation it cannot do), key version (no wire version marker exists).

**Opaque key format**:
How raw Opaque key bytes are encoded for storage or transport outside the library — `hex` (lowercase) or `base64url`. Not Crockford base32; that alphabet is reserved for ID payloads. The CLI's `keygen` emits keys in this format; `encodeOpaqueKey` / `decodeOpaqueKey` round-trip between encoded strings and raw bytes.
_Avoid_: key encoding (ambiguous with payload encoding), format (use **Opaque key format** or **Byte layout** depending on context).

**Lookup key**:
Caller-supplied opaque integer handle that the **Wrapped key codec** wraps into a public ID and recovers on unwrap. Interpretation is caller-owned — it may be a storage primary key, a packed composite, or any application-internal integer lane; the codec only enforces width and signedness via **kind** (`u32`, `i32`, `u64`, `i64`), fixed when the codec is constructed. `u32` and `i32` use safe JavaScript numbers in their fixed-width ranges and reject negative zero; `u64` and `i64` use `bigint` even when the magnitude would fit in a JavaScript number — no silent truncation or sign erasure. Not a UUID or string; UUID-sized values are out of scope for the compact 16-byte branch.
_Avoid_: primary key (too SQL-specific), integer identifier (collides with public **Id** vocabulary), storage key (ambiguous with **Opaque key**).

**Wrapped key codec**:
A codec variant that reversibly wraps a **Lookup key** into a public ID under operator key material. `wrap(lookupKey)` and `unwrap(id)` are the core async methods; wire methods (`is`, `parse`, `safeParse`) are structural and sync — they validate prefix and base32 only, not payload integrity. Cryptographic verification happens in `unwrap` / `safeUnwrap`, not in `parse`; this is verified compact wrapping, not AEAD. `unwrap` takes a trusted `Id<Brand>` and throws on **verification failure**. `safeUnwrap` takes untrusted input, structurally parses first, then verifies — on success returning canonical `id` and recovered `lookupKey`; on failure returning parse errors or verification failure without throwing. Tamper, wrong ring, and revoked-key cases are indistinguishable without a wire key id. Value types follow **kind** at the type level (`number` for 32-bit kinds, `bigint` for 64-bit). Deterministic under fixed key material: the same lookup key yields the same public ID — **equality leakage**: an observer without the key can tell when two public IDs wrap the same lookup key, but cannot unwrap them or recover operator key material. Not timestamp-family — payload **Byte layout** is an integer lane plus verification tag, not a creation timestamp. Distinct from the **Digest codec** (one-way). Constructed via `createWrappedKeyId(brand, { kind, keys })` on `@smonn/ids/wrapped`. A future randomized variant could spend payload bits on nonces at the cost of tag strength; out of scope for the compact deterministic branch.
_Avoid_: encrypt/decrypt (use wrap/unwrap), Encrypted primary key codec, Lookup key codec, bare `key` on unwrap results (use `lookupKey`).

**Wrapping key**:
Operator-supplied secret material for the **Wrapped key codec**, imported as a single opaque handle via `importWrappingKey`. One raw secret derives into AES and HMAC subkeys held inside the handle; callers configure a **Wrapping keyring** with these handles, not with subkeys or raw `CryptoKey` values. The raw secret is not retained after import — a SHA-256 digest of the raw bytes backs keyring duplicate-detection, and the derived subkeys are non-extractable. Distinct from the **Opaque key** — same encoded-format conventions (`hex`, `base64url`) but a separate secret domain; one raw secret must not silently serve both codecs without explicit import. Never embedded in an ID.
_Avoid_: encryption key (too generic), master key, Opaque key (different codec).

**Wrapping keyring**:
The non-empty ordered list of **Wrapping key** entries passed at codec construction. The first entry is **current** — the only one `wrap` uses. `unwrap` tries every entry in order until the verification tag matches; removing an entry revokes IDs wrapped under it. Duplicate entries for the same operator secret are rejected at construction. No key id on the wire — trial is correctness-grade (tag verification), not plausibility guessing. The same **Lookup key** wrapped under different entries yields different public IDs.
_Avoid_: key rotation (describe caller-driven ring semantics instead), epoch (unless defined precisely), current/accepted split (the ring is one ordered list; position defines current).

**Signing key**:
An imported handle (`SigningKey`) that gates HMAC tag generation and verification in the **Signed Timestamp codec**. Obtained via `importSigningKey(bytes)` from raw material (128, 192, or 256 bits); a single HMAC-SHA-256 subkey is derived through HKDF under a distinct domain-separation label and held internally. The raw secret is not retained after import — a SHA-256 digest of the raw bytes backs keyring duplicate-detection, and the derived HMAC subkey is non-extractable. A separate secret domain from both the **Opaque key** and the **Wrapping key** — same `hex` / `base64url` encoded-format conventions, but a distinct handle and label so one raw secret cannot silently serve another codec. Unlike the **Wrapping key**, it derives a single primitive (HMAC only — the Signed Timestamp codec performs no encryption). Never embedded in an ID.
_Avoid_: HMAC key (too generic), secret, signature key, Opaque key / Wrapping key (different codecs).

**Signing keyring**:
The non-empty ordered list of **Signing key** entries passed at Signed Timestamp codec construction. The first entry is **current** — the only one `generate` signs with. `verify` tries every entry in order until the tag matches; removing an entry revokes IDs signed under it. Duplicate entries for the same operator secret are rejected at construction. No key id on the wire — trial is correctness-grade (tag verification), and false-accept scales as `keyring_size / 2⁴⁰` per verify. Mirrors the **Wrapping keyring**; this is the authenticated rotation home the Opaque key-rotation decision (#103) defers transparent try-all-keys verification to.
_Avoid_: key rotation (describe ring semantics instead), epoch, current/accepted split (position defines current).

**Digest key**:
An imported handle (`DigestKey`) that gates the keyed digest in the **Digest codec**. Obtained via `importDigestKey(bytes)` from raw material (128, 192, or 256 bits); a single HMAC-SHA-256 subkey is derived through HKDF under the distinct domain-separation label `ids/digest/hmac` and held internally. A separate secret domain from the **Opaque key**, **Wrapping key**, and **Signing key** — same `hex` / `base64url` encoded-format conventions, but a distinct handle and label so the same raw bytes imported as a `DigestKey` are cryptographically independent of any other codec's key. Unlike those codecs there is **no keyring** — the Digest codec holds exactly one key; re-keying is a deliberate breaking action (every ID changes), never an in-band rotation. Never embedded in an ID.
_Avoid_: HMAC key (too generic), secret, digest secret, Digest keyring (there is no ring), Signing key / Wrapping key / Opaque key (different codecs).

**Namespace**:
The non-secret, required, construction-time domain separator (`ns`) of the **Digest codec**, mixed length-prefixed into the digested message alongside the **brand** and material. The same material under a different `ns` yields a different ID, so one **Digest key** can serve multiple unlinkable domains. Distinct from **brand**: brand is on the wire (visible in the ID), `ns` is folded into the digest and never appears — which is what lets two domains share one visible prefix yet stay uncorrelated (e.g. stable pseudonyms for emails vs. ticket refs under one brand). Required and non-empty by design; the framing is part of a stable-forever map and cannot be added or changed later without altering every existing ID. See [ADR-0017](./docs/adr/0017-digest-codec-construction.md).
_Avoid_: prefix (that is the visible **brand**), salt (a namespace is non-secret and deterministic, not per-ID randomness), domain (too generic), scope.

**Equality leakage**:
The observable property of the deterministic codecs — the **Wrapped key codec** and the **Digest codec** — that the same input under the same key always yields the same public ID, because there is no randomness or nonce in the construction. For the Wrapped key codec the input is a **Lookup key**; for the Digest codec it is the (`ns`, material) pair. An observer without operator material can determine that two identical public IDs encode the same input, but cannot recover that input or the key material from the wire form alone. This is intended, not a flaw: it is the property that makes idempotency keys, content addressing, and stable pseudonyms work, and (for Wrapped key) an accepted trade-off for fitting an 8-byte integer lane and an 8-byte verification tag into the shared 16-byte payload — see [ADR-0009](./docs/adr/0009-wrapped-key-compact-construction.md) and [ADR-0017](./docs/adr/0017-digest-codec-construction.md). A salt or nonce would defeat it, at the cost of determinism.
_Avoid_: correlation leak (prefer **equality leakage** for precision), determinism leak.

**Digest codec**:
A one-way codec variant that digests caller **material** into a stable public ID under operator key material; the material cannot be recovered from the ID. `digest(material)` is the only cryptographic method — async, taking `string | Uint8Array`; the structural wire methods (`is`, `parse`, `safeParse`, `toJsonSchema`, `~standard`) are sync. The **Payload** is the leftmost 16 bytes of `HMAC-SHA-256` over a length-prefixed `brand ‖ ns ‖ material` message. Deterministic like the **Wrapped key codec** — same material yields the same ID, **equality leakage** is the intended property — but **irreversible**: there is no `unwrap` or `verify`, and a Digest ID carries no verification tag (the whole payload is the one-way output). Takes a single **Digest key**, **not** a keyring: rotation would change every ID and break the stable map, and a one-way digest exposes nothing to trial a ring against. Collision birthday bound ≈ `2⁶⁴`; recovery resistance rests entirely on key secrecy (low-entropy material is brute-forceable by a key holder). Constructed via `createDigestId(brand, { ns, key })` on `@smonn/ids/digest`. For idempotency keys, content-addressed records, and stable public pseudonyms. See [ADR-0017](./docs/adr/0017-digest-codec-construction.md).
_Avoid_: Hash codec (too generic), Derived ID codec, encrypt/sign (it neither hides reversibly nor attaches a verifiable tag), Digest keyring (there is no ring — one key by design).

**Canonical form**:
The unique representation of an ID — lowercase, with Crockford base32 aliases (`o`, `i`, `l`) already resolved to `0`, `1`, `1`, **and the 26th (final) base32 character must have its low 2 bits set to zero** (i.e. it must be one of `0 4 8 c g m r w`). This last constraint arises because a 16-byte (128-bit) payload encoded in 26 Crockford base32 chars (130 bits) leaves 2 surplus padding bits in the final char; canonical encoding sets them to zero. Two strings denote the same ID iff their canonical forms are equal. `Id<Brand>` always holds a canonical string: `generate()` produces canonical, `parse()`/`safeParse()` normalise to canonical at the boundary and reject strings with non-zero padding bits as `invalid_base32`, and `is()` is strict — see [ADR-0003](./docs/adr/0003-canonical-strict-is.md).
_Avoid_: normalised form (use **Canonical form**), valid form.

**Payload**:
The 16 raw bytes that follow the prefix in an encoded ID. Always 16 bytes, always base32-encoded, regardless of codec. What those bytes mean is the codec's **Byte layout** — payload is the wire-level concept, byte layout is the per-codec interpretation.
_Avoid_: ULID (reserve "ULID" for the spec itself), body, contents.

**Byte layout**:
A per-codec description of what the 16 payload bytes are and how they're produced. The Timestamp byte layout is 6 bytes of millisecond-precision Unix timestamp (big-endian) followed by 10 bytes of randomness — ULID-shaped, encoded in lowercase Crockford base32, wrapped in a brand envelope rather than emitted bare. The Wrapped key byte layout is an 8-byte integer lane (big-endian; `u32`/`i32` use zero/sign extension in the upper half) followed by an 8-byte verification tag — a fixed 64-bit truncation of a domain-separated HMAC over the brand, **kind**, and lane — encrypted as a single 16-byte block on the wire. Other codecs define their own byte layouts; the shared invariant is the 16-byte width and the base32 encoding.
_Avoid_: layout (ambiguous with UI/visual), scheme (loses byte-level specificity), format.

**IdsError**:
The single error class thrown by caller-reachable public failures — bad brand, bad key format/encoding/length, bad wrapped `kind`, empty or duplicate keyring, invalid **Lookup key**, **verification failure** that throws, and invalid-ID throws from `parse` / database read adapters. It extends `Error` and carries a stable **Error code** in `code`; the human-readable `message` is non-contractual and may be restated. Recognized via `isIdsError(value)`, a branded type guard that survives realm/dual-package duplication where bare `instanceof` would not. Not subclassed per failure — one class, the `code` discriminates. Internal-invariant guards (internal hex decode, forged-handle lookups, the 48-bit timestamp range check, the Hono `HTTPException` path) stay plain `Error`: they signal a bug or misuse, not caller data. See [ADR-0011](./docs/adr/0011-coded-ids-error.md).
_Avoid_: per-failure error classes (use one class + **Error code**), error enum (the codes are a string-literal union), matching on `message` text (use `code`).

**Error code**:
The stable, machine-readable failure reason on **IdsError** — the `code` field, typed as the `IdsErrorCode` string-literal union. Codes collapse by caller remedy: sites that share a fix share a code, and the case-specific detail (which kind, which range, how many bytes) lives in the non-contractual `message`, not in extra codes. The throwing vocabulary aligns with the non-throwing result codes rather than duplicating them: `verification_failed` is simultaneously the code thrown by both `unwrap` and `verify`, and the `safeUnwrap` result string, and `invalid_id` (thrown by `parse` and the prisma/drizzle/kysely read adapters) carries the underlying **ParseError** on `cause`. The `safeParse` / `safeUnwrap` result _shapes_ are unchanged. The eleven codes are public stability contract: `invalid_brand` (brand not three lowercase `a–z`), `invalid_namespace` (ns is empty or whitespace-only), `invalid_key_format` (format not `hex`/`base64url`), `invalid_key_encoding` (key string malformed for its format), `invalid_key_length` (raw key not 16/24/32 bytes), `invalid_kind` (wrapped kind not `u32`/`i32`/`u64`/`i64`), `empty_keyring` (no keyring entries), `duplicate_keyring_entry` (two entries share raw secret), `invalid_lookup_key` (lookup key out of range or wrong type for the kind), `verification_failed` (no keyring entry verifies the tag), and `invalid_id` (string is not a valid ID for the brand). Adding a code later is additive (minor); renaming or removing one is breaking. See [ADR-0011](./docs/adr/0011-coded-ids-error.md).
_Avoid_: error type (use **Error code** for the `code` value, **IdsError** for the class), reason string (reserve for adapter result vocabulary), message code (the message is non-contractual; the code is the contract).

## Example dialogue

> **Dev:** I'm storing user IDs in a column. Do I store the string the user typed, or transform it first?
>
> **Domain expert:** Store the canonical form. Two strings that decode to the same ID are distinct as JS strings — `===` is wrong unless both are canonical. `safeParse()` returns canonical; that's what goes in the database.
>
> **Dev:** So `is()` is the wrong check at the boundary?
>
> **Domain expert:** Right. `is()` is strict — it only returns `true` for already-canonical strings. Use it to discriminate between brands on input you already trust. For untrusted external input, use `safeParse()`; it normalises and hands back an `Id<Brand>` you can rely on.
>
> **Dev:** What if I have a string I know is a user ID and just want the timestamp out of it?
>
> **Domain expert:** It has to be typed as an `Id<"usr">` first — `extractTimestamp` trusts the type. The honest way to get one is `usr.safeParse(...)`. If you cast a raw string to `Id<"usr">`, you own the consequences.
>
> **Dev:** Why does everything hang off `usr` instead of being top-level functions?
>
> **Domain expert:** `usr` is a codec. One codec per brand, built at module init. The brand is validated once at construction and the prefix is captured by each method. Standalone functions would either re-validate every call or let bad brands silently corrupt data.
>
> **Dev:** And the part after `usr_` is just random?
>
> **Domain expert:** No — it's the payload. First 6 bytes are a millisecond Unix timestamp, then 10 random bytes. ULID-shaped, but lowercase and wrapped in a brand envelope. That's why IDs sort by creation time.
>
> **Dev:** Support pasted an invoice ID — can I get the creation time from it?
>
> **Domain expert:** Only if that brand uses the Opaque Timestamp codec and you have the Opaque key. `extractTimestamp` decrypts under the key; without it, the timestamp isn't recoverable from the wire form. Same on the CLI: `inspect --opaque` with `IDS_KEY` set. Run `inspect` without `--opaque` on an Opaque Timestamp-encoded ID and you'll get a timestamp line — but it's meaningless; the variants are wire-indistinguishable.

## Flagged ambiguities / known gaps

**Same-millisecond sort order is non-deterministic.** Two IDs generated in the same ms by the same process have independent random tails; they sort randomly relative to each other rather than by generation order. This is deliberate — see ADR-0002. Adding ULID-style monotonic increment would require a stateful generator and a breaking change to `TimestampOptions`, and is a separate design exercise if the need ever arises.

**Wire-indistinguishable variants cannot be inferred from an ID alone.** An Opaque Timestamp-encoded ID looks identical to a Timestamp-encoded ID on the wire. Any tool that decodes a timestamp without the correct Opaque key — including `inspect` run without `--opaque` — interprets encrypted payload bytes as plaintext Timestamp bytes and prints a meaningless timestamp. The operator must know which codec variant the brand uses; see [ADR-0007](./docs/adr/0007-wire-indistinguishable-codec-variants.md).

**Wrong Opaque key is indistinguishable from the right one at decrypt time.** Unauthenticated AES-CBC (ADR-0004) never throws on a wrong-key decrypt and never yields a padding oracle (the strip-trick reconstruction always produces valid PKCS#7); a well-formed but incorrect key yields a plausible-looking timestamp, not an error; the decrypt does issue a SubtleCrypto call, which could throw under abnormal conditions unrelated to key correctness. `extractTimestamp` — and CLI `inspect --opaque` — assume the operator supplied the same key used at generation. Missing or malformed key material is rejected; key mismatch is not detectable. This is why rotation is forward-only and caller-tracked rather than a library-trialled ring — see **Key epoch** and [ADR-0013](./docs/adr/0013-opaque-key-rotation.md).

**`inspect --signed` verification contract.** `inspect --signed` always emits the full timestamp report on stdout and a `verification:` verdict on one of three values — `ok`, `failed`, or `unavailable`. The timestamp is plaintext-readable regardless of the key, so stdout always carries the report once the ID structurally parses. The exit code and stderr carry the pass/fail signal: exit 0 only on `ok`; exit 1 for `failed` (with a `verification_failed: <message>` line on stderr) and for `unavailable` (with the specific key diagnostic — missing or malformed — on stderr). `--opaque` and `--wrapped` do not follow this contract: the Opaque Timestamp codec cannot detect a wrong key, and the Wrapped key codec has no readable payload to show on failure.
