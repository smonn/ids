# UUID interop: a raw, lossless, version-agnostic 128-bit mapping on every codec

> **Note (2026-06-26).** UUID interop has shipped. `toUUID`, `fromUUID`, and `safeFromUUID` are available on every codec instance; the `"invalid_uuid"` `ParseError` reason is part of the stability contract. The CLI surface also shipped: `inspect` emits a `uuid:` line, `generate --uuid` emits raw UUID output, and `inspect --from-uuid <uuid> --brand <brand>` converts back. The "deferred to follow-up issues" and "README left untouched until the feature ships" statements in the body are now historical. The deferred items listed in Consequences (spec-valid `toUUIDv7`, version-asserting `fromUUIDv7`, wider input leniency, ORM native-uuid storage mode, SQL DDL emitter, `SPEC.md` conformance vectors) remain deferred.

Add a conversion pair — `toUUID` / `fromUUID` (plus `safeFromUUID`) — between an `Id<Brand>` and a 128-bit UUID string, so a branded ID can be persisted into a native `uuid` column (or handed to a UUID-only system) and read back without loss. The motivating consumers are migration off UUID primary keys (an app adopting branded IDs at the edge while keeping its existing `uuid` column type and indexes), DBAs who want a real indexed `uuid` storage type rather than `text`, and cross-system handoff to a UUID-only API — together the "UUID interop" sketch in [docs/IDEAS.md](../IDEAS.md). This is the closest of the TypeID feature-parity gaps now that the 128-bit payload width is settled ([ADR-0015](./0015-twenty-byte-payload-wide-block-prp.md)).

This is a design-acceptance gate. Implementation — the wire functions, the per-codec methods, the new `ParseError` reason, tests, README, and CLI — is deferred to follow-up issues filed after this ADR reaches `main`.

## Why this clears the "no consumer" bar that rejected the recent variants

The randomized Wrapped key variant and the Signed Timestamp tail-budget split were both **rejected (2026-06-25)** for lack of a concrete consumer ([docs/IDEAS.md](../IDEAS.md)). That bar applies far more weakly here, and the difference is structural, not a matter of demand:

- Those were **new codec variants** — each adds a third wire-indistinguishable skin ([ADR-0007](./0007-wire-indistinguishable-codec-variants.md)) and spends real cryptographic budget (a nonce stealing tag bits, a re-split of the tail). They change what bytes mean.
- This is a **pure, reversible re-encoding of bytes the library already emits**. The 16-byte **Payload** is, per its glossary definition, "always 16 bytes… regardless of codec." A UUID is exactly those 16 bytes written in hyphenated hex instead of brand-wrapped Crockford base32. No new wire form, no entropy spent, no key, no crypto. The conversion is to `parse`/`generate` what a different text codec is to the same bytes.

So the gating question is not "is the demand proven?" but "is the construction sound and the scope honest?" — which is what the rest of this ADR settles.

## Decision: raw, not spec-valid UUIDv7

The mapping is the **raw 128-bit value**: `toUUID` writes the 16 payload bytes verbatim as a UUID; `fromUUID` reads any 16 bytes verbatim back into the payload. The output is a syntactically valid UUID string but is **not** a spec-valid UUIDv7 (or any version) — its version and variant nibbles are simply whatever the timestamp/random/ciphertext bytes happen to be.

The alternative — emit a spec-valid UUIDv7 by setting the 4-bit version and 2-bit variant fields — is rejected because **it is mutually exclusive with lossless round-trip**, and round-trip is the property every consumer needs:

- UUIDv7 spends 6 bits on version + variant. Our payload has **no spare bits** — the Timestamp byte layout is 48 timestamp bits + 80 random bits, all 128 used ([ADR-0002](./0002-payload-layout.md)). Setting the version/variant fields therefore **overwrites 6 of the 80 random bits**.
- That makes the conversion lossy: `fromUUID(toUUID(id))` would differ from `id` in up to 6 bits whenever the original id's bits did not already match the v7 pattern. An identity-changing conversion is unusable for a migration or storage round-trip.

You cannot have both lossless round-trip and spec-valid version bits, because in this format the version/variant positions hold real data. Round-trip wins. (We carry 80 random bits where UUIDv7 carries 74; the raw mapping keeps all 80.)

## Decision: every codec, not a timestamp-family fence

The conversion is available on **every codec instance** — Timestamp, Reverse Timestamp, Opaque Timestamp, Signed Timestamp, Wrapped key, and Digest — backed by one shared wire-layer implementation.

The earlier IDEAS sketch fenced this to "plaintext timestamp/reverse codecs only," on the reasoning that "the keyed and opaque codecs deliberately expose no extractable structure, so… a `toUUID` on an opaque ID would either leak nothing useful or break the confidentiality promise." **The raw decision dissolves that fence**, because raw `toUUID` extracts no structure at all:

- An ID's Crockford base32 string already fully reveals its 16 payload bytes to anyone holding the ID. `toUUID` emits **the same bytes** in a different alphabet (hex). It reveals nothing a reader of the ID does not already have — for the Opaque Timestamp codec the timestamp stays AES-encrypted; hex does not decrypt it. **Confidentiality is untouched** ([ADR-0004](./0004-aes-cbc-strip-trick.md)).
- The "leak nothing useful → pointless" half also fails: the point is not to expose structure, it is `uuid`-column storage and cross-system handoff, which are equally valuable whether the payload is plaintext, ciphertext, an HMAC tag, or a wrapped lane. Round-trip is lossless for every codec, and `extractTimestamp` / `unwrap` / `verify` all still work after `fromUUID(toUUID(id))`.

Because the operation is defined on the shared **Payload**, restricting it to a subset would require inventing a justification the raw decision already removed, and would leave an awkward "why not opaque?" with no real security answer. Universal is the more consistent and more honest scope. The only codec-specific caveats are documentation, not capability:

- Only **Timestamp** produces a UUID with a meaningful, v7-shaped time prefix (real millisecond timestamp in the leading 48 bits).
- Only **Timestamp** and **Reverse Timestamp** produce **time-sortable** UUIDs (Reverse sorts descending — its leading bytes are the bitwise-inverted timestamp, [ADR-0010](./0010-reverse-timestamp-inversion.md)). The keyed and digest codecs produce valid but random-sorting UUIDs — exactly as their base32 forms already sort.

## `fromUUID` is version-agnostic by necessity

`fromUUID` does **not** inspect the version nibble. This is forced, not lax: `toUUID`'s own output is raw and usually is _not_ version 7, so a `fromUUID` that required version 7 could not even round-trip the library's own export. Round-trip identity demands version-agnostic import.

The consequence is a real but bounded hazard, and it is the same hazard the library already documents:

- Feed `fromUUID` a genuine **UUIDv7** and the leading 48 bits are a real timestamp: the resulting `Id<Brand>` has a correct `extractTimestamp` and sorts correctly. This is the migration sweet spot — an existing `uuid` v7 primary-key column imports cleanly and keeps its creation times and sort order.
- Feed it a **UUIDv4** (or any non-time-ordered UUID) and the leading 48 bits are random: you still get a structurally valid `Id<Brand>`, but its "timestamp" is a meaningless date and it sorts randomly.

This is precisely the **wire-indistinguishable** contract already in force ([ADR-0007](./0007-wire-indistinguishable-codec-variants.md)): the library cannot tell a random leading 6 bytes from a real timestamp, just as it cannot tell encrypted payload bytes from plaintext ones. The caller owns the guarantee that imported UUIDs came from a time-ordered source. It is recorded as a flagged ambiguity in `CONTEXT.md`.

A version-asserting variant that fails loudly on non-v7 input (a migration safety rail) is a reasonable future addition but is **not** part of this decision — it is additive and deferred.

## API shape and failure model

`toUUID` takes a trusted `Id<Brand>` (already canonical) and, like `extractTimestamp`, **trusts the type and cannot fail** — it is a total function returning a plain `string`. `fromUUID` takes untrusted external input and follows the same boundary discipline as `parse` / `safeParse`:

| Method | Signature | On bad input |
| --- | --- | --- |
| `toUUID` | `(id: Id<Brand>) => string` | n/a — total, trusts the type |
| `fromUUID` | `(value: string) => Id<Brand>` | throws `IdsError` `code: "invalid_id"`, `ParseError` on `cause` |
| `safeFromUUID` | `(value: unknown) => ParseResult<Brand>` | returns `{ ok: false, error }` |

Decisions inside this shape:

- **Return type of `toUUID` is plain `string`**, not a branded `Uuid<Brand>`. The whole point of `toUUID` is to **shed the brand**; the output is raw 16 bytes with no prefix. A phantom `Uuid<Brand>` would claim a guarantee the format cannot carry — once that value lands in a `uuid` column and is read back as a plain string, the brand is gone and two brands' UUIDs are byte-indistinguishable. Plain `string` is the honest signal: "you have left branded territory; re-enter only through `fromUUID`."
- **One new `ParseError` reason: `"invalid_uuid"`** (malformed UUID syntax), reusing the existing `"not_string"` for non-string input. So `safeFromUUID`'s error is one of `"not_string" | "invalid_uuid"`. We do **not** reuse `"invalid_base32"`: the input alphabet is hex, not Crockford base32, and `"invalid_base32"` on a UUID input is a misleading reason to bake into a stability contract. Appending to the `ParseError` union is additive (minor); the **`IdsErrorCode` union is untouched** — the throw reuses `"invalid_id"` (the outcome, "could not produce a valid `Id<Brand>`," is the same as `parse`), carrying the new reason on `cause`, exactly as `parse` does ([ADR-0011](./0011-coded-ids-error.md)).
- **Input leniency starts tight: case-insensitive, hyphenated `8-4-4-4-12` only.** This covers the dominant source (a Postgres `uuid` column round-trips lowercase hyphenated) plus the common uppercase cross-system case (RFC 9562 says parsers should accept uppercase). Braces (`{…}`), the `urn:uuid:` prefix, and hyphenless 32-char forms are rejected for now; the caller normalizes them. Loosening later is **additive and non-breaking** — accepting more inputs never breaks an existing caller — so the tight default costs nothing future-proof. `toUUID` always emits RFC-canonical lowercase hyphenated output regardless.

## The round-trip is a clean bijection

`toUUID(fromUUID(u)) === u` for every 128-bit UUID `u`, and `fromUUID(toUUID(id)) === id` for every canonical id of the brand. The padding bits cause no trouble: 16 bytes encode to 26 Crockford base32 chars carrying 130 bits, whose 2 surplus low bits in the final character are **base32 padding beyond the 128-bit payload**, which the canonical form pins to zero ([ADR-0003](./0003-canonical-strict-is.md)). A UUID is exactly 128 bits with no padding, so `fromUUID` zero-pads on encode and therefore **always yields a canonical id** — the set of canonical ids for a brand and the set of all 128-bit UUIDs are in exact bijection.

## Considered options

- **Spec-valid UUIDv7 export only** — rejected: lossy (overwrites 6 random bits), breaks round-trip identity. See Decision above.
- **Raw plus an opt-in lossy `toUUIDv7`** — deferred, not taken now: it serves only the rarest consumer (handoff to a system that _validates_ the version) and hands everyone else a footgun ("UUID" that does not survive round-trip). Recorded in IDEAS with the 6-bit entropy-cost reasoning, reopenable on a concrete validate-the-version consumer.
- **Timestamp-family-only (or Timestamp-only) scope** — rejected: the raw decision removes the confidentiality rationale that fence rested on; the operation is defined on the shared Payload and applies cleanly everywhere. A narrower scope buys only a tidier marketing story at the cost of a carve-out with no real security answer.
- **Branded `Uuid<Brand>` return** — rejected: claims a brand guarantee the format cannot carry past a `uuid` column. See API shape.
- **`fromUUID` requires version 7** — rejected: would reject the library's own raw output and break round-trip. Version-asserting import is deferred as a separate migration safety rail.
- **Reuse `"invalid_base32"` for malformed UUID input** — rejected: misleading reason in a stability contract; `"invalid_uuid"` is honest and the union extension is additive.
- **Maximally lenient input (braces / `urn:` / hyphenless)** — deferred: additive later; start with the single canonical input shape.
- **Free functions instead of codec methods** — rejected: `fromUUID` must know the brand to stamp and to return `Id<Brand>`, so the operation is brand-scoped and belongs on the codec, like every other method. The implementation is nonetheless a shared, prefix-taking wire function (next to `safeParse` in `src/wire/`), so there is no per-codec duplication.

## Consequences

- **Wire layer.** New prefix-taking functions live beside `safeParse` in `src/wire/` (a `toUUID(prefix, id)` / `fromUUID(prefix, value)` / `safeFromUUID(prefix, value)` family). Every codec exposes `toUUID` / `fromUUID` / `safeFromUUID` by delegating to them; no codec-specific logic. Confirms, structurally, that this is a wire-level operation rather than a codec feature.
- **Stability contract.** `ParseError` gains `"invalid_uuid"` (additive/minor). `ParseResult`, `IdsError`, and the eleven-member `IdsErrorCode` union are unchanged. `parse`/`safeParse` result shapes are unchanged.
- **CONTEXT.md** adds a **Raw UUID mapping** glossary term and a flagged ambiguity for the non-time-ordered-UUID import hazard (cross-referencing [ADR-0007](./0007-wire-indistinguishable-codec-variants.md)). The README's `ParseError` enumeration gains `"invalid_uuid"` when the feature ships.
- **README and "what this is not for".** The "Wire-compatible ULIDs" non-goal stays; a new note clarifies that `toUUID` produces a _raw, unversioned_ UUID (lossless round-trip), not a spec-valid UUIDv7. Left untouched until the feature ships, mirroring [ADR-0012](./0012-signed-timestamp-construction.md) / [ADR-0017](./0017-digest-codec-construction.md), so consumers are not pointed at an unshipped API.
- **Deferred to their own issues / ADRs**, paired with this one but out of scope here:
  - Spec-valid one-way `toUUIDv7` export (lossy; entropy-cost reasoning on file).
  - Version-asserting `fromUUIDv7` migration safety rail.
  - Wider `fromUUID` input leniency (hyphenless / braced / `urn:`).
  - CLI surface (`inspect` `uuid:` line; `generate --uuid`; `--from-uuid`).
  - ORM adapter native-`uuid`-column storage mode (the DBA / migration payoff).
  - SQL DDL emitter targeting a `uuid` domain instead of `text`.
  - `SPEC.md` plus cross-language conformance vectors — a UUID mapping is exactly the kind of thing vectors should pin, but it is a separate decision.
