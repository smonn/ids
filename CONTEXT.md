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

**Codec variant**:
A concrete codec algorithm sharing the same wire shape (`<brand>_` + 26 Crockford base32 chars) but differing in byte layout and capabilities. Shipped today: the **Timestamp codec** and the **Opaque Timestamp codec**. Accepted, not yet shipped: the **Wrapped key codec** — see [ADR-0009](./docs/adr/0009-wrapped-key-compact-construction.md). Each variant is a separate subpath export — see [ADR-0005](./docs/adr/0005-codec-variant-subpath-exports.md).
_Avoid_: default codec (use **Timestamp codec** for the dominant variant), trust mode, algorithm.

**Timestamp-family codec**:
A codec variant whose payload represents an ID creation timestamp, either readable directly or recoverable only under key. Current members are the **Timestamp codec** and **Opaque Timestamp codec**; future members may include a **Signed Timestamp codec** or **Reverse Timestamp codec**.
_Avoid_: timestamp layout (use **Timestamp byte layout** for the plaintext byte split), time codec, chronological codec.

**Timestamp codec**:
The dominant timestamp-family codec variant. Payload carries the **Timestamp byte layout** in plaintext — IDs sort by creation time and `extractTimestamp` works without a key. Constructed via `createTimestampId(brand)` on the main entry; fully synchronous.
_Avoid_: default codec, standard codec, ULID codec, createId.

**Opaque Timestamp codec**:
A timestamp-family codec variant that AES-encrypts the payload under caller-supplied **Opaque key** material. Same wire shape as the Timestamp codec, but the timestamp is not readable from the ID without the key. `generate` and `extractTimestamp` are key-dependent; parsing methods work on the wire form only — see [ADR-0006](./docs/adr/0006-async-keyed-codec-contract.md). No time-range bound methods (`minIdForTime` / `maxIdForTime`) — encrypted payloads do not sort by creation time. Constructed via `createOpaqueTimestampId(brand, { key })`.
_Avoid_: Opaque codec, encrypted codec, private codec, secure codec, createOpaqueId.

**Opaque key**:
The AES key (128, 192, or 256 bits of raw bytes) that gates encryption and decryption in the Opaque Timestamp codec. Distinct from the ID **Payload** — an Opaque key is operator-supplied secret material, never embedded in an ID. `extractTimestamp` requires the same key that was used at generation time.
_Avoid_: secret, encryption key (too generic), master key.

**Opaque key format**:
How raw Opaque key bytes are encoded for storage or transport outside the library — `hex` (lowercase) or `base64url`. Not Crockford base32; that alphabet is reserved for ID payloads. The CLI's `keygen` emits keys in this format; `encodeOpaqueKey` / `decodeOpaqueKey` round-trip between encoded strings and raw bytes.
_Avoid_: key encoding (ambiguous with payload encoding), format (use **Opaque key format** or **Byte layout** depending on context).

**Lookup key**:
Caller-supplied opaque integer handle that the **Wrapped key codec** wraps into a public ID and recovers on unwrap. Interpretation is caller-owned — it may be a storage primary key, a packed composite, or any application-internal integer lane; the codec only enforces width and signedness via **kind** (`u32`, `i32`, `u64`, `i64`), fixed when the codec is constructed. For `u32`, values must be safe integers in `[0, 2³²−1]` at `wrap` — no silent truncation. Not a UUID or string; UUID-sized values are out of scope for the compact 16-byte branch.
_Avoid_: primary key (too SQL-specific), integer identifier (collides with public **Id** vocabulary), storage key (ambiguous with **Opaque key**).

**Wrapped key codec**:
A codec variant that reversibly wraps a **Lookup key** into a public ID under operator key material. `wrap(lookupKey)` and `unwrap(id)` are the core async methods; wire methods (`is`, `parse`, `safeParse`) are structural and sync — they validate prefix and base32 only, not payload integrity. Cryptographic verification happens in `unwrap` / `safeUnwrap`, not in `parse`; this is verified compact wrapping, not AEAD. `unwrap` takes a trusted `Id<Brand>` and throws on **verification failure**. `safeUnwrap` takes untrusted input, structurally parses first, then verifies — on success returning canonical `id` and recovered `lookupKey`; on failure returning parse errors or verification failure without throwing. Tamper, wrong ring, and revoked-key cases are indistinguishable without a wire key id. Value types follow **kind** at the type level (`number` for 32-bit kinds, `bigint` for 64-bit). Deterministic under fixed key material: the same lookup key yields the same public ID — **equality leakage**: an observer without the key can tell when two public IDs wrap the same lookup key, but cannot unwrap them or recover operator key material. Not timestamp-family — payload **Byte layout** is an integer lane plus verification tag, not a creation timestamp. Distinct from the **Digest codec** (one-way). Constructed via `createWrappedKeyId(brand, { kind, keys })` on `@smonn/ids/wrapped`. A future randomized variant could spend payload bits on nonces at the cost of tag strength; out of scope for the compact deterministic branch.
_Avoid_: encrypt/decrypt (use wrap/unwrap), Encrypted primary key codec, Lookup key codec, bare `key` on unwrap results (use `lookupKey`).

**Wrapping key**:
Operator-supplied secret material for the **Wrapped key codec**, imported as a single opaque handle via `importWrappingKey`. One raw secret derives into AES and HMAC subkeys held inside the handle; callers configure a **Wrapping keyring** with these handles, not with subkeys or raw `CryptoKey` values. Distinct from the **Opaque key** — same encoded-format conventions (`hex`, `base64url`) but a separate secret domain; one raw secret must not silently serve both codecs without explicit import. Never embedded in an ID.
_Avoid_: encryption key (too generic), master key, Opaque key (different codec).

**Wrapping keyring**:
The non-empty ordered list of **Wrapping key** entries passed at codec construction. The first entry is **current** — the only one `wrap` uses. `unwrap` tries every entry in order until the verification tag matches; removing an entry revokes IDs wrapped under it. Duplicate entries for the same operator secret are rejected at construction. No key id on the wire — trial is correctness-grade (tag verification), not plausibility guessing. The same **Lookup key** wrapped under different entries yields different public IDs.
_Avoid_: key rotation (describe caller-driven ring semantics instead), epoch (unless defined precisely), current/accepted split (the ring is one ordered list; position defines current).

**Digest codec**:
A one-way codec variant: caller material is digested into a stable public ID under operator key material; the material cannot be recovered from the ID. Deterministic like the **Wrapped key codec**, but irreversible. For idempotency keys, content-addressed records, and stable public pseudonyms.
_Avoid_: Hash codec (too generic), Derived ID codec.

**Canonical form**:
The unique representation of an ID — lowercase, with Crockford base32 aliases (`o`, `i`, `l`) already resolved to `0`, `1`, `1`. Two strings denote the same ID iff their canonical forms are equal. `Id<Brand>` always holds a canonical string: `generate()` produces canonical, `parse()`/`safeParse()` normalise to canonical at the boundary, and `is()` is strict — see [ADR-0003](./docs/adr/0003-canonical-strict-is.md).
_Avoid_: normalised form (use **Canonical form**), valid form.

**Payload**:
The 16 raw bytes that follow the prefix in an encoded ID. Always 16 bytes, always base32-encoded, regardless of codec. What those bytes mean is the codec's **Byte layout** — payload is the wire-level concept, byte layout is the per-codec interpretation.
_Avoid_: ULID (reserve "ULID" for the spec itself), body, contents.

**Byte layout**:
A per-codec description of what the 16 payload bytes are and how they're produced. The Timestamp byte layout is 6 bytes of millisecond-precision Unix timestamp (big-endian) followed by 10 bytes of randomness — ULID-shaped, encoded in lowercase Crockford base32, wrapped in a brand envelope rather than emitted bare. The Wrapped key byte layout is an 8-byte integer lane (big-endian; `u32`/`i32` use zero/sign extension in the upper half) followed by an 8-byte verification tag — a fixed 64-bit truncation of a domain-separated HMAC over the brand, **kind**, and lane — encrypted as a single 16-byte block on the wire. Other codecs define their own byte layouts; the shared invariant is the 16-byte width and the base32 encoding.
_Avoid_: layout (ambiguous with UI/visual), scheme (loses byte-level specificity), format.

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

**Wrong Opaque key is indistinguishable from the right one at decrypt time.** Unauthenticated AES-CBC (ADR-0004) never throws on decrypt; a well-formed but incorrect key yields a plausible-looking timestamp, not an error. `extractTimestamp` — and CLI `inspect --opaque` — assume the operator supplied the same key used at generation. Missing or malformed key material is rejected; key mismatch is not detectable. See [docs/IDEAS.md](./docs/IDEAS.md) (key rotation) for rotation and plausibility-check options.
