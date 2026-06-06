# Deferred ideas

Rough sketches kept for future evaluation. Not commitments. Each entry is a hypothetical
shape, not a designed API.

## Codec variants (separate factories)

If trust-mode variants ever ship, each gets its own factory (`createTimestampId` becoming
the explicit name for the current one). They do not share a Codec contract — same wire
skin, different invariants.

- ~~`createOpaqueId(brand, {key})`~~ — shipped. See [ADR-0004](./adr/0004-aes-cbc-strip-trick.md),
  [ADR-0005](./adr/0005-codec-variant-subpath-exports.md), [ADR-0006](./adr/0006-async-keyed-codec-contract.md),
  [ADR-0007](./adr/0007-wire-indistinguishable-codec-variants.md).
- **`createSignedId(brand, {key})`** — random tail becomes a truncated HMAC over
  brand+timestamp. Tamper-evident share links verified without a DB lookup.
- **`createDerivedId(brand, {ns, key})`** — drops timestamp and random; payload is
  `HMAC(ns, key)`. Deterministic IDs for idempotency keys and content-addressed records.
- **`createReverseId(brand)`** — bitwise-inverted timestamp bytes; lexicographic order
  = newest first. For KV stores where descending range scans are awkward.

## Opaque key management

Three related threads around operating the Opaque codec's key. Sketches, not commitments.

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
  - _Transparent try-all-keys_ belongs to an authenticated variant (`createSignedId`'s
    truncated HMAC gives a tag to verify a decrypt against); an 80-bit tag makes a small
    ring effectively false-positive-free. Adding a key-id to Opaque itself is rejected
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
  opaque codec's `generate`/`extractTimestamp` are async, so `run()` would return a
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

- ~~**JSDoc on public codec methods.** `Codec` / `OpaqueCodec` method names are
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
