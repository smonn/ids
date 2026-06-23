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
- ~~**`createSignedTimestampId(brand, {keys})`**~~ — shipped. See [ADR-0012](./adr/0012-signed-timestamp-construction.md).
  Glossary: **Signed Timestamp codec**, **Signing key**, **Signing keyring** in [CONTEXT.md](../CONTEXT.md).
- ~~**`createDigestId(brand, {ns, key})`**~~ — accepted design: see [ADR-0017](./adr/0017-digest-codec-construction.md).
  One-way deterministic keyed digest of caller material; same material gives the same public ID,
  material is unrecoverable. Single key, no keyring; `ns` is required domain separation.
  Glossary: **Digest codec**, **Digest key**, **Namespace** in [CONTEXT.md](../CONTEXT.md).
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

- ~~**Key rotation is caller-driven, not transparent.** Forward-only, caller-tracked
  rotation (`generate` uses the current key; `extractTimestamp` needs the key from the
  ID's epoch, which the caller tracks out-of-band); a probabilistic trial-decrypt variant
  rejected as dashboard-grade-only; transparent try-all-keys deferred to the authenticated
  Signed Timestamp codec; a wire key-id rejected for the same reasons GCM was in
  ADR-0004.~~ — decided in [ADR-0013](./adr/0013-opaque-key-rotation.md) (Option 1,
  caller-driven, no API change). Transparent correctness-grade rotation lives on the
  Signed Timestamp codec's **Signing keyring** ([ADR-0012](./adr/0012-signed-timestamp-construction.md)).
  Glossary updated with a **Key epoch** entry; the probabilistic and wire-key-id options
  are recorded as rejected.
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

## Wire payload width (16 → 20 bytes)

_Proposed, deferred to v1 — see [ADR-0015](./adr/0015-twenty-byte-payload-wide-block-prp.md)._

The shared 16-byte payload is not a multiple of 5, so 26 Crockford base32 chars carry 2
surplus padding bits in the final character — the root of the non-canonical trailing-bit
issue (#210). The accepted fix for #210 pins those bits to zero in the canonical form
([ADR-0003](./adr/0003-canonical-strict-is.md)). A **structural** alternative is to widen the
payload to **20 bytes (160 bits → exactly 32 base32 chars, no padding)**, eliminating the
surplus bits by construction.

The open question is specifically **16 → 20** (15 bytes is rejected — it drops below the
128-bit entropy floor). The cost is real: it invalidates every previously-issued ID across
every codec, and because 20 bytes is not an AES block, the Opaque and Wrapped codecs' single-
block AES strip trick ([ADR-0004](./adr/0004-aes-cbc-strip-trick.md)) must be replaced with a
160-bit wide-block PRP (recommended: a 4-round Feistel reusing the existing single-block AES
primitive). It also yields free upgrades — Timestamp/Reverse random 80 → 112 bits, Signed tag
40 → 64 bits, Wrapped tag 64 → 96 bits. Because the #210 hole is already closed, this is a
pure quality/entropy change whose breaking cost is best amortised in a deliberate v1
breaking-change batch rather than shipped on its own.

## Explicitly rejected

- **Monotonic intra-ms ordering.** See ADR-0002 — non-goal for public-facing IDs.
- **`prefixForDay(date)`.** Leaky abstraction (prefix length varies by date
  boundary). `min/maxIdForTime` covers the actual range-query use case on any
  btree-indexed column.
- **Migration CLI subcommand.** Replaced by `codec.generateAt(date)` — migrations
  are a 5-line user script using `generateAt` + the source format's timestamp.
