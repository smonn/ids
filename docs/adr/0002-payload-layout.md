# Payload layout: ULID-shaped, with deliberate divergences

The payload is laid out exactly like a ULID: 48-bit millisecond Unix timestamp (big-endian) followed by 80 random bits, encoded as 26 Crockford base32 characters. We adopt the ULID byte split because it's already k-sortable, fits cleanly into 26 base32 chars, and gives ~80 bits of randomness per millisecond (collision-safe for any plausible single-app throughput).

Three deliberate divergences from the spec:

- **Lowercase encoding.** The brand is lowercase a–z (see [ADR-0001](./0001-brand-format.md)) and lowercasing the payload keeps the whole ID visually uniform. Decoding remains case-insensitive.
- **Brand envelope.** IDs are emitted with a `<brand>_` prefix rather than as bare 26-char strings. Off-the-shelf ULID parsers will not accept these and shouldn't be expected to.
- **No monotonicity.** Two IDs generated in the same millisecond by the same process do not sort deterministically. The ULID spec's monotonic-increment recommendation would require a stateful generator and break the `Options.rng` shape. Sort stability within a single ms is a non-goal for public-facing entity IDs.

## Timestamp contract

`Codec.extractTimestamp(id)` is a public, supported method — its existence makes the timestamp layout part of the stability contract, not an implementation detail. Specifically:

- **Position:** first 6 bytes of the payload (immediately after the prefix, before the random bytes)
- **Encoding:** unsigned big-endian integer
- **Precision:** milliseconds
- **Epoch:** Unix (1970-01-01T00:00:00Z) — not a custom epoch

Unix is non-negotiable. 48 bits of ms gives ~8919 years of headroom from 1970, so there is no bit-budget motivation to rebase (the Snowflake/Discord rationale). A custom epoch would burn the only remaining direct ULID compatibility (the timestamp bytes themselves) and turn epoch into a magic number every external consumer of the bytes would have to know.

`extractTimestamp` does not validate its input — it trusts the `Id<Brand>` type. Callers holding raw external strings must pass them through `safeParse()` / `parse()` first (see [ADR-0003](./0003-canonical-strict-is.md)).

## Consequences

The 16-byte payload layout is part of the wire format. Changing the byte split (e.g. 8+8, 4+12), the timestamp precision, the byte order, or the epoch invalidates every previously-issued ID — the same constraint as the brand width.
