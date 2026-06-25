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
- ~~**`createDigestId(brand, {ns, key})`**~~ — shipped (`@smonn/ids/digest`). See
  [ADR-0017](./adr/0017-digest-codec-construction.md); implemented in #291, CLI support in #304.
  One-way deterministic keyed digest of caller material; same material gives the same public ID,
  material is unrecoverable. Single key, no keyring; `ns` is required domain separation.
  Glossary: **Digest codec**, **Digest key**, **Namespace** in [CONTEXT.md](../CONTEXT.md).
- ~~**`createReverseTimestampId(brand)`**~~ — shipped. See [ADR-0010](./adr/0010-reverse-timestamp-inversion.md).
  Bitwise-inverted timestamp bytes; lexicographic order = newest first. For KV stores where descending range scans are awkward.
- ~~**`createWrappedKeyId(brand, {kind, keys})`**~~ — shipped (`@smonn/ids/wrapped`).
  Reversible verified wrapping of a storage lookup key. See
  [ADR-0009](./adr/0009-wrapped-key-compact-construction.md); CLI support in #99.
  Glossary: **Wrapped key codec**, **Lookup key**, **Wrapping key** in [CONTEXT.md](../CONTEXT.md).

### Future codec variants (unbuilt)

Sibling variants the accepting ADRs left open. Both were **evaluated and rejected (2026-06-25)**
with no concrete consumer on file (no open issue requested either). Kept here so the questions are
not reopened without new evidence; each would still need its own ADR before any code.

- ~~**Randomized Wrapped key variant.**~~ **Rejected.** A sibling to the compact Wrapped key codec
  that spends payload bits on a nonce, trading away tag strength _and_ determinism (so no equality
  leakage). Inside the fixed 16-byte payload the lane (64 bits) must stay, so a meaningful nonce
  (~32 bits) comes straight out of the tag — dropping it to **32 bits, the exact width
  [ADR-0009](./adr/0009-wrapped-key-compact-construction.md) rejected as too weak** for
  correctness-grade unwrap. That trades the codec's headline property (verified, correctness-grade
  unwrap) for a niche leak: equality leakage only bites when "these two IDs wrap the same lookup
  key" is itself sensitive, not the common stable-public-token case (where determinism is a
  feature). When unlinkability genuinely matters you almost always want integrity too, and the
  honest construction (AEAD with a stored nonce) does not fit 16 bytes — ADR-0009 already rejected
  AES-CTR/GCM for that reason. So the in-budget variant is strictly worse than the correct answer
  ("use a wider format / different tool") and adds a third wire-indistinguishable Wrapped-family
  skin ([ADR-0007](./adr/0007-wire-indistinguishable-codec-variants.md)). Reopen only with a
  concrete consumer that needs unlinkable reversible tokens _and_ accepts 32-bit integrity. See
  ADR-0009 (Consequences) and the **Wrapped key codec** entry in [CONTEXT.md](../CONTEXT.md).
- ~~**Signed Timestamp alternate tail-budget split.**~~ **Rejected.** A variant dividing the tail
  differently — e.g. a larger tag where same-millisecond volume is known to be low. ADR-0012's own
  2026-06-24 refinement undercuts the general case: over a year the **random field is the tighter
  axis, not the tag**, so shifting bits from random to tag hardens the already-comfortable axis
  (40-bit tag ≈ 1.7 years to one online forgery at 10⁴/s) at the cost of the already-tight one. The
  only coherent regime is genuinely low write volume, and there the forgery axis is online-only and
  server-adjudicated — **verify-endpoint rate limiting** (wanted anyway) caps it for free without
  spending wire bits. Exposing the split as a knob also fights wire-indistinguishability: a 40/40 ID
  verified under a different split reads the wrong bytes as tag and silently always fails. Of the two
  this is the closer call (coherent niche, near-zero construction cost), but it stays rejected absent
  a concrete low-volume-token consumer to justify the operator-confusion surface. See
  [ADR-0012](./adr/0012-signed-timestamp-construction.md).

## Wrapped key codec

_Shipped — `@smonn/ids/wrapped`. Full design lives in
[ADR-0009](./adr/0009-wrapped-key-compact-construction.md); vocabulary in [CONTEXT.md](../CONTEXT.md)._

One sub-idea from the original design remains unbuilt:

- **Detailed unwrap.** A future detailed unwrap could return the matched key id (for
  observability or rewrapping) while the common `unwrap` path returns only the recovered
  value. Not implemented today — `unwrap` / `safeUnwrap` surface the value alone.

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

_Shipped — all six live as subpath exports inside `@smonn/ids` with optional peer deps on
the third-party lib (see `src/adapters/`, `package.json` exports, and [CONTEXT.md](../CONTEXT.md))._

- ~~**`@smonn/ids/<orm>`** (Drizzle / Kysely / Prisma) — column codecs that preserve
  `Id<Brand>` through storage without per-app boilerplate.~~ — shipped (Drizzle #126,
  Prisma #135, Kysely).
- ~~**`@smonn/ids/<web>`** (Hono / Express / Fastify) — route-param middleware that
  validates against a codec and 404s on brand mismatch (not 400 — distinguishes
  "wrong kind of ID" from "malformed ID").~~ — shipped (Hono #124, Express #132, Fastify).

## Developer-facing documentation

- ~~**JSDoc on public codec methods.** `TimestampCodec` / `OpaqueTimestampCodec` method names are
  self-describing once you've read the README, but consumer IDE tooltips
  currently surface nothing about the contracts. The two most consequential to
  document inline: `extractTimestamp` trusts the `Id<Brand>` type (ADR-0002)
  and the `is()` strict / `safeParse()` lenient split (ADR-0003). Probably one
  pass across both codec types, linking to the relevant ADR per method.~~ — shipped in #41.

## Wire payload width (16 → 20 bytes)

_**Rejected (2026-06-24)** — width is settled at 128 bits. See
[ADR-0015](./adr/0015-twenty-byte-payload-wide-block-prp.md) (Status: Rejected) for the full
evaluation; this entry is kept only so the question is not reopened._

The shared 16-byte payload is not a multiple of 5, so 26 Crockford base32 chars carry 2 surplus
padding bits in the final character — the root of the non-canonical trailing-bit issue (#210). The
permanent fix pins those bits to zero in the canonical form
([ADR-0003](./adr/0003-canonical-strict-is.md)). Widening to 20 bytes (160 bits → 32 chars, no
padding) was the proposed structural alternative, deferred to v1 and then **evaluated and rejected**.

Why rejected, in one breath: the #210 hole is already closed, so this was only ever a quality
change; the collision budget shows 80 random bits already clears any realistic rate (112 would only
reach UUIDv4 parity nobody observes); under the per-codec promise lens the _only_ genuine beneficiary
is the Digest codec, which is HMAC-only and would widen for free, while the wide-block-PRP crypto cost
falls entirely on Opaque/Wrapped, which gain nothing; no alternative width is better (intermediate
char counts are unreachable or still padded, and a two-AES-block / 256-bit payload is too long and
still padded); 128 bits is the cryptographic sweet spot (payload = exactly one AES PRP, zero
construction, shortest base32 form above the entropy floor); and the one construction that would
"fit" base32 cleanly — FPE — is disqualified after FF3/FF3-1 were withdrawn from NIST (Feb 2025),
leaving FF1 a monoculture unfit to anchor a permanent wire format. A sync API does not change any of
this. **128 bits stands; 20 bytes and all other widths are rejected.**

## Undecided

Deliberately left open by an ADR — no proposal, no rejection, revisited only if a concrete
consumer appears.

- **Opaque codec via HKDF (uniform key-derivation model).** Unlike the other keyed codecs, the
  Opaque Timestamp codec imports the operator's 16/24/32 raw bytes **directly** as the AES-CBC key
  (`importOpaqueKey`, no HKDF), because an AES-128/192/256 key is exactly what the operator hands it —
  raw import is the conventional, correct construction, and opaque is already cryptographically
  independent of the HKDF codecs precisely because its key is the raw bytes rather than an HKDF output.
  Routing opaque through a labelled HKDF (`@smonn/ids/opaque/aes`) would buy only **uniformity** ("every
  keyed codec derives via a labelled HKDF, no exceptions") plus marginal domain separation against an
  _external_ system reusing the same secret as raw AES — not a load-bearing security gain. It would be a
  breaking change (re-derives every Opaque ID), so the cheapest moment to fold it in is alongside another
  keyed-codec break. Deliberately left **undecided** while standardizing the HKDF label namespace (#388,
  ADR-0019): that issue keeps opaque out of scope and documents the asymmetry as principled. Revisit only
  if the no-exceptions uniform model becomes a goal; it would need its own ADR.
- **Sync keyed codec.** The keyed codecs (Opaque Timestamp, Signed Timestamp, Digest,
  Wrapped key) have async key-dependent methods because WebCrypto's `SubtleCrypto` — the only
  cross-runtime crypto API — is async-only. A sync variant would require bundling a pure-JS
  AES/HMAC implementation (~5–10KB per algorithm, ongoing review burden), rejected in
  [ADR-0006](./adr/0006-async-keyed-codec-contract.md) for lack of a compelling consumer. The
  async contract was designed so this stays reversible: async signatures accept sync
  implementations under the same Promise contract, so a sync keyed codec can be added later
  without breaking the existing API. Nothing to decide until someone needs it.
  **Interaction with the 20-byte width ([ADR-0015](./adr/0015-twenty-byte-payload-wide-block-prp.md)):**
  pulling in a pure-JS crypto dep for sync does _not_ discount the 20-byte wide-block Feistel —
  it would have to live in both the WebCrypto and pure-JS backends (the wide-block PRP ×2), and the
  one load-bearing 20-byte benefit (Digest) is HMAC-only and independent of any AES primitive. Sync
  is additive and non-breaking; 20 bytes is a hard v1 break — keep them unbatched, and if both
  happen, do sync first so the chosen library can reveal whether a standardized PRP (FF1-style) is
  available before the 20-byte crypto is committed to a hand-rolled one. See ADR-0015's
  "Interaction with a possible sync keyed-codec API."

## Explicitly rejected

- **Monotonic intra-ms ordering.** See ADR-0002 — non-goal for public-facing IDs.
- **`prefixForDay(date)`.** Leaky abstraction (prefix length varies by date
  boundary). `min/maxIdForTime` covers the actual range-query use case on any
  btree-indexed column.
- **Migration CLI subcommand.** Replaced by `codec.generateAt(date)` — migrations
  are a 5-line user script using `generateAt` + the source format's timestamp.
- **Digest keyring / multiple live digest keys.** See [ADR-0017](./adr/0017-digest-codec-construction.md).
  The Digest codec's value is a stable-forever map (same material → same ID), so a keyring is
  actively harmful — rotation would silently break idempotency and content-address stability.
  Re-keying is an explicit breaking operator action, not in-band rotation. Only revisited if a
  future use case genuinely warrants it, with its own ADR and verification story.
- **Public `@smonn/ids/wire` subpath (parse-without-codec).** See [ADR-0008](./adr/0008-internal-module-layering.md).
  Rejected for now — adapters use `codec["~standard"]`. Can ship later if a concrete adapter need appears.
- **Randomized Wrapped key variant.** See the **Future codec variants (unbuilt)** section above and
  [ADR-0009](./adr/0009-wrapped-key-compact-construction.md). Rejected (2026-06-25) — a meaningful
  nonce forces the tag down to the 32-bit floor ADR-0009 already rejected, to solve a niche leak
  better handled by a wider format. Reopen only with a consumer needing unlinkable reversible tokens
  that also accepts 32-bit integrity.
- **Signed Timestamp alternate tail-budget split.** See the **Future codec variants (unbuilt)**
  section above and [ADR-0012](./adr/0012-signed-timestamp-construction.md). Rejected (2026-06-25) —
  ADR-0012's 2026-06-24 refinement makes the random field the tighter axis, and verify-endpoint rate
  limiting covers the forgery axis for free. Reopen only with a concrete low-volume-token consumer.
- **Changing the payload width (20 bytes / any non-128-bit length).** See
  [ADR-0015](./adr/0015-twenty-byte-payload-wide-block-prp.md) (Rejected) and the **Wire payload width**
  section above. Width is settled at 128 bits — the cryptographic and length sweet spot; #210's padding
  bits are permanently fixed by ADR-0003's canonical form.
