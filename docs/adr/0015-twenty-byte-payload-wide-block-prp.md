# 20-byte payload: a wide-block PRP retires the base32 padding bits

> **Status: Proposed — deferred to v1.** This ADR records a design that is _not_ yet
> accepted. The live fix for the underlying security issue (#210) is the canonical-form
> padding-bit constraint amended into [ADR-0003](./0003-canonical-strict-is.md); see
> [ADR-0003](./0003-canonical-strict-is.md) and PR #211. The 20-byte redesign below is a
> structural alternative that should be evaluated as part of a deliberate v1
> breaking-change batch, not shipped in isolation. The first `##` section explains why.

Pre-v1, we _could_ widen the shared wire payload from 16 to **20 bytes (160 bits → exactly
32 Crockford base32 chars, no padding)**. Doing so would supersede the 16-byte invariant
([ADR-0002](./0002-payload-layout.md)) and the AES-CBC single-block strip trick
([ADR-0004](./0004-aes-cbc-strip-trick.md)), and would make the final-character
padding-bit constraint ([ADR-0003](./0003-canonical-strict-is.md) amendment, issue #210)
unnecessary — there would be no surplus bits to constrain.

## Why deferred, not accepted

Once the #210 fix (ADR-0003 padding-bit constraint / PR #211) lands, **the security hole
is closed**. That removes all urgency from this change: it stops being a security fix and
becomes a pure quality improvement (no padding bits by construction, more entropy and
larger tags). The cost/benefit then looks like this:

- **Remaining benefits are real but not pressing.** No-padding-by-construction, +32 bits of
  Timestamp random tail, bigger HMAC tags — all desirable, none of it fixes a live problem
  once the padding-bit constraint is in place.
- **Costs are large and partly risky.** It invalidates every previously-issued ID across
  _every_ codec, _and_ it introduces brand-new cryptographic code (a wide-block PRP) that
  needs its own security review. Shipping new crypto reactively to retire 2 padding bits
  that are already neutralised is a poor trade.
- **A major breaking change wants to be amortised.** Invalidating all IDs is a
  once-per-lifetime move pre-v1. If we spend it, we should spend it once — batched with any
  other breaking changes we want before v1, so consumers migrate a single time.

**Decision: keep the ADR-0003 padding-bit fix as the canonical resolution of #210, and
revisit this 20-byte redesign at v1 planning** alongside the full breaking-change list. If
the entropy bump or the structural cleanliness earns its place there, adopt it then.

## The mathematics

Base32 packs 5 bits per character, so a padding-free payload requires `byteLength % 5 == 0`
(the alignment block is `lcm(8, 5) = 40 bits = 5 bytes ↔ 8 chars`). 16 bytes is not a
multiple of 5: `128 bits → ⌈128/5⌉ = 26 chars = 130 bits`, leaving **2 surplus bits** in the
final character — the root cause of #210. The mod-5 candidates bracketing today's 16 bytes:

| bytes | bits | base32 chars | vs. today (128-bit)                  |
| ----- | ---- | ------------ | ------------------------------------ |
| 15    | 120  | 24           | shorter, **below the 128-bit floor** |
| 20    | 160  | 32           | longer, **≥ 128 bits**               |

20 bytes is the smallest mod-5 length that does not reduce the entropy floor. It encodes to
exactly 32 chars, so `payloadBase32Length = ⌈20·8/5⌉ = 32` becomes exact and the surplus
bits — and the `base32FinalCharClass` constant — disappear entirely.

## The collision budget: what the random tail buys

The base32 alignment above is about surplus _padding_ bits. The field re-layouts below
also move the _entropy_ floor: the Timestamp and Reverse codecs' random tail grows
**80 → 112 bits** (`rand10 → rand14`). This section quantifies that, because the
entropy bump — not the padding cleanup — is the load-bearing reason to take the redesign at
v1, and the ADR otherwise asserts it without a number.

Collisions only matter **within one timestamp bucket**: two IDs with different plaintext
48-bit millisecond timestamps cannot collide, so all collision resistance rests on the random
tail drawn _per millisecond_. For `r` random bits and `n` IDs in one bucket, the birthday
bound gives `p ≈ n² / 2^(r+1)`. Going 80 → 112 multiplies the random space by `2³² ≈ 4.3 ×
10⁹`, dividing per-bucket collision probability by that same factor at any fixed load:

| IDs in one ms | (≈ IDs/sec) | r = 80 (today) | r = 112 (20-byte) |
| ------------- | ----------- | -------------- | ----------------- |
| 1,000         | 1 M/s       | 4.1 × 10⁻¹⁹     | 9.6 × 10⁻²⁹        |
| 10,000        | 10 M/s      | 4.1 × 10⁻¹⁷     | 9.6 × 10⁻²⁷        |
| 100,000       | 100 M/s     | 4.1 × 10⁻¹⁵     | 9.6 × 10⁻²⁵        |
| 1,000,000     | 1 B/s       | 4.1 × 10⁻¹³     | 9.6 × 10⁻²³        |

The decision-useful framing is the **sustained generation rate that keeps the summed annual
collision probability under a fixed budget** (here, ≤ 1-in-10⁹ per year, across the ~3.15 ×
10¹⁰ ms in a year):

| random tail       | sustained rate under 1e-9 / year     |
| ----------------- | ------------------------------------ |
| **r = 80 (today)** | ~277 IDs/ms ≈ **277,000 IDs/sec**   |
| **r = 112 (20-byte)** | ~18 M IDs/ms ≈ **18 billion IDs/sec** |

At 80 bits the budget is ~277k IDs/sec _sustained on a single brand for a year_ — high, but a
large multi-tenant system at peak can approach it. At 112 bits it is ~18 billion/sec, past any
real-world generator. The upgrade converts "a bound you could theoretically hit" into "a bound
nobody hits."

**Where this lands vs. prior art.** Normalising for time resolution (millisecond buckets are
worth ~10 bits over the 1-second buckets KSUID uses), in per-second-bucket-equivalent terms:
today's tail is `80 + 10 ≈ 90` effective bits; the 20-byte tail is `112 + 10 ≈ 122` — essentially
[UUIDv4](https://www.rfc-editor.org/rfc/rfc9562) parity (122 random bits) and within ~6 bits of
[KSUID](https://github.com/segmentio/ksuid)'s 128 — but in a 32-char string rather than KSUID's
27 base62 or UUID's 36 hex. KSUID itself needs 128 random bits precisely because its 1-second
bucket is ~1000× coarser than a millisecond one; finer resolution is why ULID (and this codec)
get away with less. The 20-byte width buys UUIDv4-grade collision resistance while staying
shorter than both.

**This is a comfort/margin upgrade, not a fix.** Reaching 1e-9/year at 80 bits takes ~277k
IDs/sec sustained for a year — so 80 bits is not a live problem, exactly as the security
analysis concludes the padding hole is already closed. The strongest argument for the bump is
not "80 is unsafe" but "112 retires the collision-rate conversation from the docs permanently,
the way UUIDv4 and KSUID users never have it." (The Signed/Wrapped tag-width changes below are a
separate _forgery_-resistance budget, not collision resistance, and are not modelled here.)

## Decision crux: the Signed random field, not the tag, forces the width

The budget above covers the plaintext Timestamp/Reverse tail (80 → 112). The Signed codec splits
its 80-bit tail two ways — `ts6 ‖ rand5 ‖ tag5` (40 random / 40 tag,
[ADR-0012](./0012-signed-timestamp-construction.md)) — and that split is where the 20-byte
question is actually decided. Worked against realistic sustained load on one brand, both axes
land opposite to intuition:

- **The 40-bit tag is not thin.** Forgery is online-only — the signing key never leaves the
  server, so there is no offline brute force — succeeding at `n / 2⁴⁰` per live `verify`. One
  forgery needs ~10¹² failing requests, i.e. **years of endpoint saturation** even at 10⁴–10⁶
  verify/s, and a forged tag only proves "minted by the key," not a capability. 40 bits clears
  the bar twice over.
- **The 40-bit random field is the binding constraint.** Same-millisecond collisions accumulate
  over a year: at ~1,000 IDs/s on one brand, 40-bit random expects **~1.4 × 10⁻² collisions/year**
  — far closer to the edge than the tag's "years per forgery."

Inside 16 bytes the tail is zero-sum, so **no re-budget fixes this**: growing the tag shrinks the
already-tight random field, and the only collision-favouring split (48 random / 32 tag) reuses
the 32-bit tag width [ADR-0009](./0009-wrapped-key-compact-construction.md) rejected as too weak.
20 bytes is the only construction that relieves the tight axis without robbing the tag
(`ts6 ‖ rand6 ‖ tag8` → 48 random / 64 tag, both widened at once).

Whether that relief is load-bearing turns on a single severity question — and crucially **not**
the one the codec's headline framing first suggests. Signed is advertised for share links
_verified without a DB lookup_, but that describes stateless **authenticity** (no round-trip to
check the tag); it is independent of whether a **persisted, unique-indexed row** exists to catch a
collision:

- **Persisted, unique-indexed ID** — the common share-link shape: a stored grant/share row with a
  target, expiry, and revocation state. A collision is a caught insert error → regenerate. The
  lenient bar applies; 40-bit random comfortably serves ~835 IDs/s/brand, and **20 bytes is pure
  margin: stay at 16.** Verifying the tag statelessly does not change this — the row still
  backstops collisions.
- **Genuinely storeless signed capability** — the tag alone is the authorization, nothing
  persisted. A collision is silent; the stringent bar applies and 40-bit random covers only ~8
  IDs/s/brand. **That profile — storeless _and_ high single-brand volume — is the lone
  load-bearing reason to take the width change at v1.**

So the v1 decision reduces to: _does the Signed codec promise correctness for storeless,
high-volume single-brand use?_ The dominant advertised use — a share link backed by a stored grant
— lands on the **first** bullet, so the realistic answer is usually "no, collisions are caught."
That makes the 20-byte collision relief **non-load-bearing for most Signed deployments**, forcing
the width only at the storeless high-volume tail. The Signed random field is still the _only_ axis
that could force it — neither the tag nor the plaintext-Timestamp entropy can — but the codec's own
suggested use places most of its weight on the side where 16 bytes already suffices.

## The crypto cost: a 160-bit permutation replaces single-block AES

Two codecs rely on the payload being exactly one 128-bit AES block (ADR-0004): **Opaque**
(`layouts/opaque.ts`) and **Wrapped** (`layouts/wrapped.ts`). The Signed codec is HMAC-only
and adapts trivially.

> **Correction (2026-06-24):** The [ADR-0018](./0018-by-feature-codec-slices.md) slice refactor retired the `layouts/` directory. These files now live at `src/codecs/opaque/layout.ts` and `src/codecs/wrapped/layout.ts`.

20 bytes is 1.25 AES blocks; the only length that is both mod-5 and a whole number of AES blocks is `lcm(5, 16) = 80` bytes (128 chars — impractical). So a mod-5 payload necessarily abandons the single-block strip trick.

Both AES codecs are deterministic by design (Wrapped maps a lookup key to a stable ID;
Opaque accepts determinism per ADR-0004), and a randomised/AEAD construction still does not
fit in 20 bytes — a safe nonce (~96 bits) plus ciphertext leaves too little room for
`ts6 + meaningful random`, and a 32-bit nonce collides at ~2¹⁶ IDs. So we still want a
**deterministic, keyed, length-preserving permutation**, just over 160 bits instead of 128.

**Recommended construction — 4-round balanced Feistel (a 160-bit strong PRP).** Split the
160-bit block into two 80-bit (10-byte) halves; the round function is
`first80bits(AES_K(roundIndex ‖ R ‖ pad))`, computed with the existing
"AES-CBC, IV=0, take the first 16 bytes" single-block primitive already used in
`opaque.ts` / `wrapped.ts`. Four rounds give a Luby–Rackoff strong PRP. This is the direct
generalisation of ADR-0004's "128-bit permutation under the key" to 160 bits, reusing the
same primitive with no new dependency or bundle weight. Cost: 4 SubtleCrypto calls per
encrypt/decrypt (vs. 1/2 today), sequential within a Feistel — acceptable for these
explicitly low-throughput async codecs. The determinism + high-entropy-plaintext IND-CPA
argument from ADR-0004 carries over unchanged; integrity stays where it belongs (HMAC tag
for Wrapped/Signed, none for Opaque).

> **Correction (2026-06-24):** `opaque.ts` and `wrapped.ts` were relocated by the [ADR-0018](./0018-by-feature-codec-slices.md) slice refactor; they now live at `src/codecs/opaque/layout.ts` and `src/codecs/wrapped/layout.ts`.

## Field re-layouts at 20 bytes (free upgrades)

| codec               | today (16 B)                  | proposed (20 B)             | effect         |
| ------------------- | ----------------------------- | --------------------------- | -------------- |
| Timestamp / Reverse | `ts6 ‖ rand10` (80-bit rand)  | `ts6 ‖ rand14`              | 112-bit random |
| Signed              | `ts6 ‖ rand5 ‖ tag5` (40-bit) | `ts6 ‖ rand6 ‖ tag8`        | 64-bit tag     |
| Wrapped             | `lane8 ‖ tag8` (64-bit tag)   | `lane8 ‖ tag12`             | 96-bit tag     |
| Opaque              | `ts6 ‖ rand10`, single-block  | `ts6 ‖ rand14`, Feistel-PRP | 112-bit random |

## Considered options

- **Stay at 16 bytes + pin the padding bits (ADR-0003 amendment / PR #211) — ACCEPTED as the
  #210 fix; this ADR is the deferred alternative.** Correct and zero-migration, at the price
  of leaving the surplus bits and a length-specific `[048cgmrw]` final-char class in place.
- **20 bytes + 4-round Feistel wide-block PRP — the recommended form _if_ we take the
  redesign.** Clean PRP, reuses the existing single-block primitive, +entropy/+tag bits.
- **20 bytes + AES-CBC ciphertext-stealing (CTS) — fallback.** Smallest delta from the strip
  trick (~2 calls) but hand-rolled (no WebCrypto CTS), CBC-malleable, and a fussier security
  writeup than Feistel for little saving. Documented in case the 4-call cost ever bites.
- **15 bytes / 120 bits — REJECTED.** Shorter IDs, but below the 128-bit entropy floor
  (72-bit Timestamp random tail).
- **80 bytes (mod-5 ∧ mod-16) — REJECTED.** The only length keeping single-block AES _and_
  zero padding, but 128-char IDs are a non-starter.
- **CTR-family / FPE (FF1/FF3) — REJECTED.** CTR with a fixed/derived counter degenerates or
  risks keystream reuse (ADR-0004 already rejected the CTR family); FPE adds bundle weight.

## Consequences (if adopted at v1)

- **Breaking:** every previously-issued ID across every codec is invalidated. Acceptable
  pre-v1; would not be post-v1. Changeset would be **major**.
- `payloadByteLength = 20`, `payloadBase32Length = 32` (exact); **`base32FinalCharClass` is
  deleted** and the ADR-0003 padding-bit amendment is reverted — no surplus bits exist.
- Field re-layouts deliver free upgrades: Timestamp/Reverse random 80→112 bits, Signed tag
  40→64 bits, Wrapped tag 64→96 bits.
- A new internal wide-block-PRP module under `wire/` (or `layouts/`), requiring its own
  security review. [ADR-0004](./0004-aes-cbc-strip-trick.md) would be marked **superseded**
  and [ADR-0002](./0002-payload-layout.md) rewritten for the new length.

  > **Correction (2026-06-24):** The `layouts/` directory was retired by [ADR-0018](./0018-by-feature-codec-slices.md). Under the current structure a wide-block-PRP module would live at `src/codecs/<name>/layout.ts` (or a shared `wire/` module), not under a `layouts/` directory.

- **No code, wire, or `CONTEXT.md` change ships from this ADR.** It records a deferred design
  decision; adoption is a separate, deliberate v1 change.
