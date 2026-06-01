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
The brand-scoped object returned by `createId(brand)`, exposing `generate`, `is`, `parse`, `safeParse`, and `extractTimestamp`. The brand is validated once at codec creation; the prefix is then captured by each method. One codec per entity type, typically constructed at module init.
_Avoid_: factory, generator, encoder.

**Canonical form**:
The unique representation of an ID — lowercase, with Crockford base32 aliases (`o`, `i`, `l`) already resolved to `0`, `1`, `1`. Two strings denote the same ID iff their canonical forms are equal. `Id<Brand>` always holds a canonical string: `generate()` produces canonical, `parse()`/`safeParse()` normalise to canonical at the boundary, and `is()` is strict — see [ADR-0003](./docs/adr/0003-canonical-strict-is.md).
_Avoid_: normalised form (use **Canonical form**), valid form.

**Payload**:
The 16 raw bytes that follow the prefix in an encoded ID: 6 bytes of millisecond-precision Unix timestamp (big-endian) followed by 10 bytes of randomness. ULID-shaped — same byte layout as a [ULID](https://github.com/ulid/spec), but encoded in lowercase Crockford base32 and wrapped in a brand envelope rather than emitted bare.
_Avoid_: ULID (use **Payload** when talking about our bytes; reserve "ULID" for the spec itself), body, contents.

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

## Flagged ambiguities / known gaps

**Same-millisecond sort order is non-deterministic.** Two IDs generated in the same ms by the same process have independent random tails; they sort randomly relative to each other rather than by generation order. This is deliberate — see ADR-0002. Adding ULID-style monotonic increment would require a stateful generator and a breaking change to `Options`, and is a separate design exercise if the need ever arises.
