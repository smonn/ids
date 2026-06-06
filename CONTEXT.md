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
A concrete codec algorithm sharing the same wire shape (`<brand>_` + 26 Crockford base32 chars) but differing in byte layout and capabilities. Shipped today: the **Timestamp codec** and the **Opaque codec**. Each variant is a separate subpath export — see [ADR-0005](./docs/adr/0005-codec-variant-subpath-exports.md).
_Avoid_: default codec (use **Timestamp codec** for the dominant variant), trust mode, algorithm.

**Timestamp codec**:
The dominant codec variant. Payload carries the **Timestamp byte layout** in plaintext — IDs sort by creation time and `extractTimestamp` works without a key. Constructed via `createId(brand)` on the main entry; fully synchronous.
_Avoid_: default codec, standard codec, ULID codec.

**Opaque codec**:
A codec variant that AES-encrypts the payload under caller-supplied **Opaque key** material. Same wire shape as the Timestamp codec, but the timestamp is not readable from the ID without the key. `generate` and `extractTimestamp` are key-dependent; parsing methods work on the wire form only — see [ADR-0006](./docs/adr/0006-async-keyed-codec-contract.md). No time-range bound methods (`minIdForTime` / `maxIdForTime`) — encrypted payloads do not sort by creation time.
_Avoid_: encrypted codec, private codec, secure codec.

**Opaque key**:
The AES key (128, 192, or 256 bits of raw bytes) that gates encryption and decryption in the Opaque codec. Distinct from the ID **Payload** — an Opaque key is operator-supplied secret material, never embedded in an ID. `extractTimestamp` requires the same key that was used at generation time.
_Avoid_: secret, encryption key (too generic), master key.

**Opaque key format**:
How raw Opaque key bytes are encoded for storage or transport outside the library — `hex` (lowercase) or `base64url`. Not Crockford base32; that alphabet is reserved for ID payloads. The CLI's `keygen` emits keys in this format; `encodeOpaqueKey` / `decodeOpaqueKey` round-trip between encoded strings and raw bytes.
_Avoid_: key encoding (ambiguous with payload encoding), format (use **Opaque key format** or **Byte layout** depending on context).

**Canonical form**:
The unique representation of an ID — lowercase, with Crockford base32 aliases (`o`, `i`, `l`) already resolved to `0`, `1`, `1`. Two strings denote the same ID iff their canonical forms are equal. `Id<Brand>` always holds a canonical string: `generate()` produces canonical, `parse()`/`safeParse()` normalise to canonical at the boundary, and `is()` is strict — see [ADR-0003](./docs/adr/0003-canonical-strict-is.md).
_Avoid_: normalised form (use **Canonical form**), valid form.

**Payload**:
The 16 raw bytes that follow the prefix in an encoded ID. Always 16 bytes, always base32-encoded, regardless of codec. What those bytes mean is the codec's **Byte layout** — payload is the wire-level concept, byte layout is the per-codec interpretation.
_Avoid_: ULID (reserve "ULID" for the spec itself), body, contents.

**Byte layout**:
A per-codec description of what the 16 payload bytes are and how they're produced. The Timestamp byte layout is 6 bytes of millisecond-precision Unix timestamp (big-endian) followed by 10 bytes of randomness — ULID-shaped, encoded in lowercase Crockford base32, wrapped in a brand envelope rather than emitted bare. Other codecs (if added) define their own byte layouts; the shared invariant is the 16-byte width and the base32 encoding.
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
> **Domain expert:** Only if that brand uses the Opaque codec and you have the Opaque key. `extractTimestamp` decrypts under the key; without it, the timestamp isn't recoverable from the wire form. Same on the CLI: `inspect --opaque` with `IDS_KEY` set. Run `inspect` without `--opaque` on an Opaque-encoded ID and you'll get a timestamp line — but it's meaningless; the variants are wire-indistinguishable.

## Flagged ambiguities / known gaps

**Same-millisecond sort order is non-deterministic.** Two IDs generated in the same ms by the same process have independent random tails; they sort randomly relative to each other rather than by generation order. This is deliberate — see ADR-0002. Adding ULID-style monotonic increment would require a stateful generator and a breaking change to `Options`, and is a separate design exercise if the need ever arises.

**Wire-indistinguishable variants cannot be inferred from an ID alone.** An Opaque-encoded ID looks identical to a Timestamp-encoded ID on the wire. Any tool that decodes a timestamp without the correct Opaque key — including `inspect` run without `--opaque` — interprets encrypted payload bytes as plaintext Timestamp bytes and prints a meaningless timestamp. The operator must know which codec variant the brand uses; see [ADR-0007](./docs/adr/0007-wire-indistinguishable-codec-variants.md).
