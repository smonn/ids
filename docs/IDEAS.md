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

## Adapter integrations (subpath exports)

If ergonomic adapters ship, they live as subpath exports inside `@smonn/ids` with
optional peer deps on the third-party lib — not as sibling packages.

- **`@smonn/ids/<orm>`** (Drizzle / Kysely / Prisma) — column codecs that preserve
  `Id<Brand>` through storage without per-app boilerplate.
- **`@smonn/ids/<web>`** (Hono / Express / Fastify) — route-param middleware that
  validates against a codec and 404s on brand mismatch (not 400 — distinguishes
  "wrong kind of ID" from "malformed ID").

## Developer-facing documentation

- **JSDoc on public codec methods.** `Codec` / `OpaqueCodec` method names are
  self-describing once you've read the README, but consumer IDE tooltips
  currently surface nothing about the contracts. The two most consequential to
  document inline: `extractTimestamp` trusts the `Id<Brand>` type (ADR-0002)
  and the `is()` strict / `safeParse()` lenient split (ADR-0003). Probably one
  pass across both codec types, linking to the relevant ADR per method.

## Explicitly rejected

- **Monotonic intra-ms ordering.** See ADR-0002 — non-goal for public-facing IDs.
- **`prefixForDay(date)`.** Leaky abstraction (prefix length varies by date
  boundary). `min/maxIdForTime` covers the actual range-query use case on any
  btree-indexed column.
- **Migration CLI subcommand.** Replaced by `codec.generateAt(date)` — migrations
  are a 5-line user script using `generateAt` + the source format's timestamp.
