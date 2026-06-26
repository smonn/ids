# @smonn/ids wire format specification

> **Status: Descriptive.** This document describes the wire format of the
> reference implementation [`@smonn/ids`](./README.md). It is _descriptive, not
> normative_: no conformance claim is offered to third parties yet, and the
> format carries no version marker by design ([ADR-0007](./docs/adr/0007-wire-indistinguishable-codec-variants.md),
> [ADR-0015](./docs/adr/0015-twenty-byte-payload-wide-block-prp.md)). The
> format's stability is the guarantee of the project's [ADRs](./docs/adr/), not
> a new contract. Elevation to a normative specification — with a published
> conformance suite a third party may claim conformance against — is an
> additive status change to this document, made when a concrete cross-language
> porter appears ([ADR-0025](./docs/adr/0025-frozen-wire-spec-conformance-vectors.md)).

This document describes the format precisely enough to reimplement in another
language without reverse-engineering the ADRs. The ADRs are linked throughout as
provenance and rationale; the rules themselves are stated here in full.

## Conventions

The keywords **MUST**, **MUST NOT**, **SHOULD**, and **MAY** in this document
are to be interpreted as described in [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119)
and [RFC 8174](https://www.rfc-editor.org/rfc/rfc8174) — that is, only when
written in **uppercase**. A lowercase "must" or "should" in prose is ordinary
English, not a requirement keyword.

These keywords describe the behavior an implementation needs in order to match
this wire format. Because this document is descriptive (see **Status**), the
requirements describe the reference implementation `@smonn/ids` and do not yet
constitute a conformance claim offered to third parties. When the document is
elevated to normative, these same requirements become the conformance contract
unchanged — only the **Status** above changes.

Byte values are written in hexadecimal (`0x9a`, or `9a` in byte sequences).
Bit and byte ordering is **big-endian** (most-significant first) everywhere
unless stated otherwise. Byte ranges use half-open interval notation: `[0, 6)`
is bytes 0 through 5 inclusive.

## Token shape

An ID is a string of the form:

```
<brand>_<payload>
```

- `<brand>` — exactly three lowercase ASCII letters (see **Brand**).
- `_` — a single literal underscore (U+005F) separator.
- `<payload>` — exactly 26 Crockford base32 characters encoding a 16-byte
  payload (see **Crockford base32 and canonical form** and **Payload**).

A **canonical** ID MUST match this regular expression exactly:

```
^[a-z]{3}_[0-9a-hjkmnp-tv-z]{25}[048cgmrw]$
```

The total canonical length is always 30 characters (3 + 1 + 26). The final
character class `[048cgmrw]` is the padding-bit constraint described below.

**Running example.** This document uses one ID throughout, shown three ways:

| View       | Value                                    |
| ---------- | ---------------------------------------- |
| ID         | `usr_06f80z92d2dbsqqg28t5cy4tqg`         |
| Payload    | `01 9e 80 7d 22 68 9a bc de f0 12 34 56 78 9a bc` |
| UUID       | `019e807d-2268-9abc-def0-123456789abc`   |

## Brand

The brand is exactly **three lowercase ASCII letters** (`a`–`z`). It carries the
ID's type and is part of the wire format: changing the brand width invalidates
every previously issued ID ([ADR-0001](./docs/adr/0001-brand-format.md)).

- A brand MUST be exactly three characters, each in `a`–`z`. Uppercase letters,
  digits, and other characters MUST NOT appear in a brand.
- The brand is followed by a single `_` separator, then the 26-character
  payload.

Which three-letter brands an application uses, and the runtime brand registry
that warns on cross-codec reuse, are concerns of the reference implementation,
**not** of the wire format. The wire format constrains only the _shape_ of a
brand, not the _set_ of brands in use.

## Crockford base32 and canonical form

The 16-byte payload is encoded as 26 characters of
[Crockford base32](https://www.crockford.com/base32.html), lowercase.

### Alphabet

The encoding alphabet is, in value order `0`–`31`:

```
0 1 2 3 4 5 6 7 8 9 a b c d e f g h j k m n p q r s t v w x y z
```

The letters `i`, `l`, `o`, and `u` are **not** in the alphabet. Crockford's
checksum symbols and hyphens are not used.

### Bit packing

Encoding packs the 16 payload bytes (128 bits) into 26 base32 characters
(130 bits), most-significant bit first:

1. Read the 128 payload bits as a big-endian bit stream.
2. Emit one character per group of 5 bits, most-significant group first, mapping
   each 5-bit value `0`–`31` to the alphabet above.
3. 128 is not a multiple of 5. After 25 characters (125 bits), 3 payload bits
   remain. The 26th character is formed from those 3 bits placed in its
   **high** position, with its **low 2 bits set to zero** — i.e. the 26th
   character encodes `(last 3 payload bits) << 2`.

Decoding reverses this: each character maps to its 5-bit value, the values are
concatenated most-significant-first into a 130-bit stream, and the leading 128
bits are taken as the payload. The trailing 2 bits are padding and are discarded
on decode.

### The padding-bit constraint (canonical final character)

Because the 2 low bits of the 26th character are padding _beyond_ the 128-bit
payload, a canonical ID always has them set to zero. The 26th character of a
canonical ID MUST therefore be one whose alphabet value is divisible by 4:

```
0  4  8  c  g  m  r  w
```

(alphabet values `0, 4, 8, 12, 16, 20, 24, 28`).

The four trailing-bit variants of any payload (`…0`, `…1`, `…2`, `…3` for the
low character group) all decode to the **same** 16 bytes. Pinning the canonical
form to zero padding bits makes the byte-to-string mapping a bijection and
closes a uniqueness-bypass gap: without it, four distinct strings would denote
one ID and could defeat deduplication, idempotency-key, and similar checks
([ADR-0003](./docs/adr/0003-canonical-strict-is.md)).

### Canonical form

A **canonical** ID is the unique representation of an ID:

- lowercase;
- with Crockford visual aliases already resolved (see **Canonicalization**);
- whose 26th payload character is in `[048cgmrw]` (zero padding bits).

Two strings denote the same ID **iff** their canonical forms are equal. A
producer MUST emit canonical IDs. A value held in storage or passed between
systems SHOULD be canonical.

### Canonicalization (lenient input)

When accepting an ID from an untrusted boundary (URL parameter, form field,
request body), an implementation canonicalizes lenient input as follows, in
order:

1. **Case fold.** Map ASCII `A`–`Z` to `a`–`z`. This is **ASCII-only**; no
   Unicode case folding is applied. The brand and payload are both folded.
2. **Resolve aliases.** In the payload, map the Crockford visual aliases to
   their canonical digits: `o`/`O` → `0`, and `i`/`I`/`l`/`L` → `1`.
3. **Validate.** The result MUST match the canonical regular expression in
   **Token shape**. In particular, alias resolution happens **before** this
   check, so a 26th character of `o` or `O` first becomes `0` and then passes,
   while a 26th character whose value is not divisible by 4 (non-zero padding
   bits) is **rejected**.

Steps 1–2 are the leniency; step 3 is strict. The lenient path is part of the
frozen surface: the reference implementation's `parse` / `safeParse` perform
exactly this canonicalization, and the `canonicalize` conformance vectors pin
the lenient-input → canonical-output mapping.

A strict acceptance predicate (the reference implementation's `is`) MUST accept
a string only if it is **already** canonical — it performs no case folding or
alias resolution. Use the strict predicate to test an already-typed value; use
canonicalization to ingest external input.

### Rejection layers

A malformed input is rejected at the structural layer where it first fails. An
implementation MUST classify rejections consistently:

| Layer           | Cause                                                                       |
| --------------- | --------------------------------------------------------------------------- |
| not a string    | input is not a string at all                                                |
| prefix layer    | brand is not exactly three lowercase ASCII letters, or the `_` is missing   |
| base32 layer    | payload is not 26 chars, contains a non-alphabet character, or (after alias resolution) has a non-zero-padding 26th character |

> **Reference-implementation API (informative, not part of the frozen
> surface).** `@smonn/ids` reports these as the `ParseError` reason strings
> `"not_string"`, `"invalid_prefix"`, and `"invalid_base32"` respectively (and
> `"invalid_uuid"` on the UUID-import path, see **Raw UUID mapping**). A port
> maps these to its own error idioms; the _strings_ are not a conformance
> requirement, but the _layer_ at which each input is rejected is.

### Worked example 1 — base32 encode

Encoding the running example's payload:

```
payload (16 bytes):  01 9e 80 7d 22 68 9a bc de f0 12 34 56 78 9a bc
                     = 128 bits, big-endian

128 bits + 2 zero padding bits = 130 bits = 26 × 5

base32 (26 chars):   06f80z92d2dbsqqg28t5cy4tqg
```

The 26th character is `g` (alphabet value 16, divisible by 4): the encoder
placed the final 3 payload bits in its high position and zeroed the 2 low
padding bits, so the canonical final character falls in `[048cgmrw]`. The full
ID is `usr_06f80z92d2dbsqqg28t5cy4tqg`.

## Payload

The **payload** is the 16 raw bytes that the 26-character base32 string encodes.
It is always 16 bytes and always base32-encoded, **regardless of codec**. The
payload width is the strongest wire invariant: changing it invalidates every ID
across every codec ([ADR-0002](./docs/adr/0002-payload-layout.md),
[ADR-0015](./docs/adr/0015-twenty-byte-payload-wide-block-prp.md)).

What the 16 bytes _mean_ is the codec's **byte layout**. Every codec is
**wire-indistinguishable**: the token shape, the base32 encoding, and the 16-byte
width are identical across all codecs, so `parse` / `safeParse` / `is` cannot
tell one codec's IDs from another's ([ADR-0007](./docs/adr/0007-wire-indistinguishable-codec-variants.md)).
An operator MUST know, out of band, which codec a given brand uses.

The two plaintext codecs below are specified in full. The four keyed codecs are
described as layout shapes only and are deferred to a future vector version (see
**Keyed codecs — not yet frozen**).

## Timestamp codec

The Timestamp byte layout fills the 16-byte payload as:

| Bytes     | Field     | Encoding                                                  |
| --------- | --------- | -------------------------------------------------------- |
| `[0, 6)`  | timestamp | 48-bit unsigned big-endian milliseconds since Unix epoch |
| `[6, 16)` | random    | 80 bits of randomness                                    |

This is the ULID byte split, with the deliberate divergences recorded in
[ADR-0002](./docs/adr/0002-payload-layout.md).

- **Timestamp.** Bytes `[0, 6)` are an unsigned big-endian integer of
  milliseconds since the Unix epoch (`1970-01-01T00:00:00Z`) — **not** a custom
  epoch. 48 bits gives roughly 8,919 years of range from 1970. A reader MUST
  interpret these bytes as plain milliseconds-since-Unix-epoch.
- **Random.** Bytes `[6, 16)` are 80 bits of randomness, giving same-millisecond
  uniqueness.
- **No monotonicity.** Two IDs generated in the same millisecond by the same
  process have no defined relative sort order. Same-millisecond sort stability is
  **not** guaranteed.

Lexicographic ordering of canonical Timestamp IDs (after the brand) equals
ascending creation-time order, because the timestamp occupies the
most-significant payload bytes and base32 encoding preserves big-endian order.

### Worked example 2 — Timestamp decode

```
ID:                  usr_06f80z92d2dbsqqg28t5cy4tqg
payload:             01 9e 80 7d 22 68 9a bc de f0 12 34 56 78 9a bc
timestamp [0,6):     01 9e 80 7d 22 68
  = 0x019e807d2268 = 1780272145000 ms
  = 2026-06-01T00:02:25.000Z
random [6,16):       9a bc de f0 12 34 56 78 9a bc
```

## Reverse Timestamp codec

The Reverse Timestamp byte layout is identical to the Timestamp layout, except
the 48-bit timestamp field is **bitwise-inverted** before encoding so that
lexicographic order equals **descending** creation-time order (newest first)
([ADR-0010](./docs/adr/0010-reverse-timestamp-inversion.md)).

| Bytes     | Field     | Encoding                                                                |
| --------- | --------- | ---------------------------------------------------------------------- |
| `[0, 6)`  | timestamp | each of the 6 timestamp bytes XORed with `0xff` (`~ts & 0xFFFFFFFFFFFF`) |
| `[6, 16)` | random    | 80 bits of randomness, written unchanged                               |

To recover the timestamp, XOR each of the 6 bytes with `0xff` again, then read
them as a 48-bit unsigned big-endian millisecond value exactly as for the
Timestamp codec. The random tail is not transformed.

**Example.** The running example's timestamp encoded under the Reverse Timestamp
codec yields `usr_zsgqz0pxjydbsqqg28t5cy4tqg` — the timestamp bytes become
`fe 61 7f 82 dd 97`, and XOR-ing each back with `0xff` recovers
`01 9e 80 7d 22 68` = `2026-06-01T00:02:25.000Z`.

## Raw UUID mapping

The **Raw UUID mapping** reinterprets the 16-byte payload verbatim as a 128-bit
UUID, and back ([ADR-0024](./docs/adr/0024-uuid-interop-raw-mapping.md)). It is
defined on the shared payload, so it applies to **every** codec.

- **To UUID.** The 16 payload bytes are written, in order, as an
  [RFC 9562](https://www.rfc-editor.org/rfc/rfc9562) canonical UUID string:
  lowercase hexadecimal, hyphenated `8-4-4-4-12`. This is total and cannot fail.
- **From UUID.** A UUID string is read back into the 16 payload bytes verbatim.
  The mapping is **version-agnostic**: it does **not** inspect or require the
  UUID version or variant nibbles. Input MUST be accepted case-insensitively in
  the hyphenated `8-4-4-4-12` form; braces (`{…}`), the `urn:uuid:` prefix, and
  hyphenless 32-character forms MAY be rejected. (Accepting more input forms
  later is additive and non-breaking.)
- **Output.** A `fromUUID` of any 128-bit value yields a **canonical** ID:
  because a UUID carries exactly 128 bits with no padding, the 2 base32 padding
  bits are set to zero on encode.

This is a clean bijection: `toUUID(fromUUID(u)) == u` for every 128-bit UUID
`u`, and `fromUUID(toUUID(id)) == id` for every canonical ID.

**Not a spec-valid UUIDv7.** All 128 bits are payload, so there are no spare
bits for a version/variant nibble. The output is a syntactically valid UUID
string but its version and variant positions hold real data, not `0x7` / `0b10`
(see **What this does not specify**).

> The reference implementation reports malformed UUID input via the
> `"invalid_uuid"` `ParseError` reason (informative API, as in **Rejection
> layers**).

### Worked example 3 — UUID round-trip

```
ID:        usr_06f80z92d2dbsqqg28t5cy4tqg
payload:   01 9e 80 7d 22 68 9a bc de f0 12 34 56 78 9a bc
UUID:      019e807d-2268-9abc-def0-123456789abc
           └──────┬──────┘ └──────────┬─────────────┘
        timestamp bytes [0,6)      random bytes [6,16)
```

Reading the UUID back, byte for byte, reproduces the payload and re-encodes to
`06f80z92d2dbsqqg28t5cy4tqg`. Note that the leading UUID bytes `019e807d-2268`
are the real millisecond timestamp — but only because this is a Timestamp ID;
for the keyed and digest codecs the leading bytes carry no time meaning and the
UUID sorts randomly.

## Keyed codecs — not yet frozen

Four further codecs share the token shape, base32 encoding, 16-byte payload, and
Raw UUID mapping specified above — so the **wire** is already frozen for them by
the shared layer. What is **not** yet frozen here is each codec's
**construction**: how it fills the 16 bytes (the exact key derivation, HMAC
message framing, and AES single-block construction), and the test keys needed to
verify a port. These, and their conformance vectors, are deferred to an additive
v2 vector version ([ADR-0025](./docs/adr/0025-frozen-wire-spec-conformance-vectors.md)).
A v1-conformant port targets the plaintext, keyless surface above.

The byte-layout shapes, for orientation (see each ADR for current prose detail):

| Codec             | Layout shape                                  | Construction (deferred)                                                                 |
| ----------------- | --------------------------------------------- | --------------------------------------------------------------------------------------- |
| Opaque Timestamp  | encrypted `ts6 ‖ rand10`                       | Timestamp layout, AES-CBC single-block encrypted under a caller key; timestamp recoverable only with the key. [ADR-0004](./docs/adr/0004-aes-cbc-strip-trick.md) |
| Signed Timestamp  | `ts6 ‖ rand5 ‖ tag5`                           | plaintext timestamp + 40-bit truncated HMAC-SHA-256 over `brand ‖ ts ‖ random`. [ADR-0012](./docs/adr/0012-signed-timestamp-construction.md) |
| Wrapped key       | `enc(lane8 ‖ tag8)`                            | 8-byte big-endian integer lane + 64-bit truncated domain-separated HMAC, AES-encrypted as one block. [ADR-0009](./docs/adr/0009-wrapped-key-compact-construction.md) |
| Digest            | `HMAC-SHA-256(key, framed message)[0..16)`     | leftmost 16 bytes of a keyed HMAC over length-prefixed `brand ‖ ns ‖ material`; one-way. [ADR-0017](./docs/adr/0017-digest-codec-construction.md) |

These four are **wire-indistinguishable** from the plaintext codecs: nothing on
the wire identifies the construction.

## Versioning and conformance vectors

The wire format carries **no version marker**. A payload version byte was
rejected ([ADR-0007](./docs/adr/0007-wire-indistinguishable-codec-variants.md))
and the 16-byte width was settled permanently
([ADR-0015](./docs/adr/0015-twenty-byte-payload-wide-block-prp.md)), so there is
no format-version number that ever increments. This document describes a single,
unversioned wire.

A machine-readable companion, `spec/vectors.json`, is the **authoritative
oracle** for the rules described here: it pins input → expected-output cases per
codec and operation (`canonicalize`, `uuid`, `timestamp.extract`, …), is
asserted against the reference implementation in CI with an exact equality
check, and is **never** regenerated from the implementation (a generated oracle
is circular and cannot catch drift). Where a concrete value in this document and
`spec/vectors.json` disagree, the vectors are authoritative — the three worked
examples here are illustrative and are written to match the vectors' seed cases.

`spec/vectors.json` carries its own monotonic `version`, **independent** of the
(unversioned) wire format and **append-only**: a new version only ever _adds_
codecs or cases; an existing vector's expected output never changes (that would
be a wire break), the sole exception being an erratum. v1 covers the shared wire
layer, the Timestamp codec, the Reverse Timestamp codec, and the Raw UUID
mapping; the keyed-codec construction vectors are the deferred v2 bump
([ADR-0025](./docs/adr/0025-frozen-wire-spec-conformance-vectors.md)).

## What this does not specify

- **No wire version marker.** The format is unversioned by design; do not look
  for or emit one.
- **Not ULID wire-compatible.** The byte layout is ULID-shaped, but the encoding
  is lowercase and brand-wrapped. Stock ULID parsers will reject these IDs, and
  this document does not define compatibility with them.
- **Not a spec-valid UUIDv7.** The Raw UUID mapping is raw and unversioned (all
  128 bits are payload). The output is not a spec-valid UUIDv7 or any other
  version. Importing a non-time-ordered UUID (e.g. a UUIDv4) into a
  timestamp-family codec yields a structurally valid ID with a meaningless
  timestamp and random sort order — the caller owns the guarantee that imported
  UUIDs came from a time-ordered source.
- **No same-millisecond ordering.** Two Timestamp IDs minted in the same
  millisecond have no defined relative order.
- **Brand registry and compile-time brand validation** are reference-implementation
  concerns, not wire format. The wire constrains the brand's shape (three
  lowercase ASCII letters), not the set of brands an application registers.
- **Keyed-codec construction and test keys** (Opaque, Signed, Wrapped, Digest)
  are not frozen here; they are deferred to a v2 vector version.

## References

- [README](./README.md) — overview, codec comparison, and API surface.
- [CONTEXT.md](./CONTEXT.md) — glossary of the project's vocabulary.
- Architecture Decision Records ([docs/adr/](./docs/adr/)):
  [0001 Brand format](./docs/adr/0001-brand-format.md) ·
  [0002 Timestamp byte layout](./docs/adr/0002-payload-layout.md) ·
  [0003 Canonical / strict `is`](./docs/adr/0003-canonical-strict-is.md) ·
  [0004 Opaque Timestamp](./docs/adr/0004-aes-cbc-strip-trick.md) ·
  [0007 Wire-indistinguishable codecs](./docs/adr/0007-wire-indistinguishable-codec-variants.md) ·
  [0009 Wrapped key](./docs/adr/0009-wrapped-key-compact-construction.md) ·
  [0010 Reverse Timestamp](./docs/adr/0010-reverse-timestamp-inversion.md) ·
  [0012 Signed Timestamp](./docs/adr/0012-signed-timestamp-construction.md) ·
  [0015 128-bit width](./docs/adr/0015-twenty-byte-payload-wide-block-prp.md) ·
  [0017 Digest](./docs/adr/0017-digest-codec-construction.md) ·
  [0024 Raw UUID mapping](./docs/adr/0024-uuid-interop-raw-mapping.md) ·
  [0025 Frozen wire spec & conformance vectors](./docs/adr/0025-frozen-wire-spec-conformance-vectors.md)
- [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119) /
  [RFC 8174](https://www.rfc-editor.org/rfc/rfc8174) — requirement keywords.
- [RFC 9562](https://www.rfc-editor.org/rfc/rfc9562) — UUID string format.
