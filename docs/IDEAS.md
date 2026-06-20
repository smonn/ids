# Deferred ideas

Rough sketches kept for future evaluation. Not commitments. Each entry is a hypothetical
shape, not a designed API.

## Codec variants (separate factories)

If more variants ship before v1, each gets its own explicit factory. Timestamp-family
variants carry `Timestamp` in the name (`createTimestampId` becoming the explicit name
for the current main-entry codec). They do not share a `TimestampCodec` contract — same wire skin,
different invariants.

- ~~`createOpaqueTimestampId(brand, {key})`~~ — shipped. See [ADR-0004](./adr/0004-aes-cbc-strip-trick.md),
  [ADR-0005](./adr/0005-codec-variant-subpath-exports.md), [ADR-0006](./adr/0006-async-keyed-codec-contract.md),
  [ADR-0007](./adr/0007-wire-indistinguishable-codec-variants.md).
- **`createSignedTimestampId(brand, {keys})`** — half the random tail becomes a truncated
  HMAC over brand+timestamp+random. Tamper-evident share links verified without a DB lookup.
  Accepted design: see [ADR-0012](./adr/0012-signed-timestamp-construction.md).
  Glossary: **Signed Timestamp codec**, **Signing key**, **Signing keyring** in [CONTEXT.md](../CONTEXT.md).
- **`createDigestId(brand, {ns, key})`** — one-way deterministic digest of caller material.
  Same material gives the same public ID; the material cannot be recovered from the ID.
  For idempotency keys, content-addressed records, and stable public pseudonyms.
- ~~**`createReverseTimestampId(brand)`**~~ — shipped. See [ADR-0010](./adr/0010-reverse-timestamp-inversion.md).
  Bitwise-inverted timestamp bytes; lexicographic order = newest first. For KV stores where descending range scans are awkward.
- **`createWrappedKeyId(brand, {kind, keys})`** — reversible verified wrapping of a
  storage lookup key. Accepted design: see [ADR-0009](./adr/0009-wrapped-key-compact-construction.md).
  Glossary: **Wrapped key codec**, **Lookup key**, **Wrapping key** in [CONTEXT.md](../CONTEXT.md).

## Wrapped key codec

_Accepted and shipped — see [ADR-0009](./adr/0009-wrapped-key-compact-construction.md) and [CONTEXT.md](../CONTEXT.md)._

A reversible counterpart to `createDigestId`: the caller supplies a storage lookup key,
the codec emits a public ID, and `unwrap` recovers the lookup key before the caller hits
storage. It keeps the shared `<brand>_` +
26-character suffix / 16-byte payload invariant. Consequence: UUID-sized lookup keys are
out of scope for this same-size branch because a UUID plus verification tag does not fit.

- **Factory and value surface.** `createWrappedKeyId(brand, {kind, keys})`, where `kind`
  is one of `u32`, `i32`, `u64`, or `i64`. `wrap(value)` and `unwrap(id)` are the core
  async methods. `u32`/`i32` use `number`; `u64`/`i64` use `bigint`. The usual wire
  methods (`is`, `parse`, `safeParse`, `toJsonSchema`, `~standard`) stay structural and
  sync. Cryptographic verification happens in `unwrap` / `safeUnwrap`, not in `parse`.
- **Byte layout.** Decrypting the 16-byte payload yields an 8-byte integer lane followed
  by an 8-byte verification tag. The lane is big-endian; signed kinds use two's-complement.
  `u32` requires zero extension into the upper 32 bits, and `i32` requires sign extension.
  The tag is a fixed 64-bit truncation of a domain-separated HMAC over the brand, integer
  kind, and integer lane.
- **Verification semantics.** This is verified compact wrapping, not AEAD. `unwrap`
  rejects unless the recomputed tag matches before any storage lookup happens;
  `safeUnwrap` returns a non-throwing result. Wrong-key or tamper false accepts are bounded
  by roughly `keyring_size / 2^64` per unwrap attempt.
- **Determinism.** The same lookup key under the same current wrapping key produces the
  same public ID. There is no randomness, nonce, or IV in the 16-byte branch; equality of
  repeated wrapped keys is intentionally leaked rather than taking bits from the 64-bit
  verification tag.
- **Key material and rotation.** Import one raw operator secret into derived AES and HMAC
  subkeys. A keyring has one current entry for `wrap` and any number of accepted entries
  for `unwrap`; removing an old entry revokes tokens wrapped with it. Because the tag
  verifies the decrypted lane, trial across a keyring is correctness-grade rather than
  the Opaque Timestamp codec's timestamp-plausibility guess. A future detailed unwrap can return the matched
  key id for observability or rewrapping while the common `unwrap` path returns only the
  recovered value.
- ~~**Documentation boundary.** Keep `CONTEXT.md` unchanged until this becomes current
  project language. If the compact construction is accepted for implementation, write an
  ADR then: it is hard to reverse, surprising without context, and the result of a real
  16-byte-size-vs-authentication trade-off.~~ — accepted in [ADR-0009](./adr/0009-wrapped-key-compact-construction.md); glossary updated.

## Opaque key management

Three related threads around operating the Opaque Timestamp codec's key. Sketches, not commitments.

- **Key rotation is caller-driven, not transparent.** The blast radius of a rotation is
  narrower than it looks: the key only feeds `extractTimestamp`. `generate`, `parse`,
  `safeParse`, `is`, and `toJsonSchema` work on the wire form and never touch it. So
  swapping the key forward is nearly free — new IDs encrypt under the new key, old IDs
  stay valid opaque strings whose _timestamp_ simply becomes unreadable without the old
  key. What blocks _transparent_ "try every key in a ring" rotation is that the
  construction is unauthenticated (ADR-0004: decrypt never throws, wrong key yields
  garbage) and carries no key-id (ADR-0007: payloads are wire-indistinguishable, no
  version marker). There is nothing to match a key against and nothing to validate a
  guess. Options, roughly in order of honesty:
  - _Forward-only, caller-tracked._ A keyring where `generate` uses the newest key and
    `extractTimestamp` takes an explicit key/epoch hint the caller supplies from its own
    records (DB column, tenant partition). No wire change.
  - _Probabilistic trial-decrypt._ Try each key, accept the one whose decoded 48-bit
    timestamp lands in a plausible window. A stale key false-accepts at ≈ 10yr / 2⁴⁸ms ≈
    0.1% — dashboard-grade, never correctness-grade, and only if documented as such.
  - _Transparent try-all-keys_ belongs to an authenticated variant (`createSignedTimestampId`'s
    truncated HMAC gives a tag to verify against — accepted in
    [ADR-0012](./adr/0012-signed-timestamp-construction.md), with a **Signing keyring** whose
    `verify` trials the ring by tag match). Adding a key-id to the Opaque Timestamp codec itself is rejected
    for the same reasons GCM was in ADR-0004: it either eats the random budget or breaks
    the 16-byte / strip-trick invariant. Likely worth its own ADR.
- ~~**`ids keygen [--bits 128|256] [--key-format hex|base64url]`** — emit a random AES key
  (default 256-bit) for `importOpaqueKey`. Needs a documented decode helper so the
  emitted string round-trips back to raw bytes. Format is `hex`/`base64url` (secret
  conventions), not Crockford base32 (that's the payload encoding). Stdout only; it's a
  secret.~~ — shipped. See `encodeOpaqueKey` / `decodeOpaqueKey` on `@smonn/ids/opaque`.
- ~~**Opaque generation from the CLI, key via env var.** `ids generate <brand> --opaque`
  (and `inspect --opaque`) reading the key from `IDS_KEY`, decoded with the same format
  as `keygen`. Env over argv deliberately — argv leaks via `ps` and shell history. A
  missing or malformed `IDS_KEY` is a clear stderr error, exit 1. Consequence: the
  Opaque Timestamp codec's `generate`/`extractTimestamp` are async, so `run()` would return a
  Promise and `bin/cli.ts` would await it — a contained change to the otherwise-sync CLI.~~
  — shipped.

## Adapter integrations (subpath exports)

If ergonomic adapters ship, they live as subpath exports inside `@smonn/ids` with
optional peer deps on the third-party lib — not as sibling packages.

- **`@smonn/ids/<orm>`** (Drizzle / Kysely / Prisma) — column codecs that preserve
  `Id<Brand>` through storage without per-app boilerplate.
- **`@smonn/ids/<web>`** (Hono / Express / Fastify) — route-param middleware that
  validates against a codec and 404s on brand mismatch (not 400 — distinguishes
  "wrong kind of ID" from "malformed ID").

## Developer-facing documentation

- ~~**JSDoc on public codec methods.** `TimestampCodec` / `OpaqueTimestampCodec` method names are
  self-describing once you've read the README, but consumer IDE tooltips
  currently surface nothing about the contracts. The two most consequential to
  document inline: `extractTimestamp` trusts the `Id<Brand>` type (ADR-0002)
  and the `is()` strict / `safeParse()` lenient split (ADR-0003). Probably one
  pass across both codec types, linking to the relevant ADR per method.~~ — shipped in #41.

## Explicitly rejected

- **Monotonic intra-ms ordering.** See ADR-0002 — non-goal for public-facing IDs.
- **`prefixForDay(date)`.** Leaky abstraction (prefix length varies by date
  boundary). `min/maxIdForTime` covers the actual range-query use case on any
  btree-indexed column.
- **Migration CLI subcommand.** Replaced by `codec.generateAt(date)` — migrations
  are a 5-line user script using `generateAt` + the source format's timestamp.
