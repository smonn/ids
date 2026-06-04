# Timestamp byte layout: ULID-shaped, with deliberate divergences

The Timestamp codec's byte layout — 48-bit millisecond Unix timestamp (big-endian) followed by 80 random bits — fills the 16-byte payload directly. We adopt the ULID byte split because it's already k-sortable, fits cleanly into 26 base32 chars, and gives ~80 bits of randomness per millisecond (collision-safe for any plausible single-app throughput).

The wire-format invariant is codec-agnostic: 16 bytes of payload, lowercase Crockford base32, prefix-wrapped. The 6+10 split documented here is specific to the Timestamp codec. Other codec variants (see [ADR-0005](./0005-codec-variant-subpath-exports.md)) define their own byte layouts within the same 16-byte envelope.

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

The Timestamp byte layout (6 timestamp + 10 random) is part of the Timestamp codec's wire-format contract. Changing the byte split, the timestamp precision, the byte order, or the epoch invalidates every previously-issued Timestamp ID — the same constraint as the brand width.

The shared 16-byte / base32 / prefix-wrapped invariant is stronger: changing it would invalidate every ID across every codec variant.
