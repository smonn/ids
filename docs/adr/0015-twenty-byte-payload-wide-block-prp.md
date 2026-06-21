# 20-byte payload: a wide-block PRP retires the base32 padding bits

> **Status: Proposed — deferred to v1.** This ADR records a design that is *not* yet
> accepted. The live fix for the underlying security issue (#210) is the canonical-form
> padding-bit constraint amended into [ADR-0003](./0003-canonical-strict-is.md); see
> [ADR-0003](./0003-canonical-strict-is.md) and PR #211. The 20-byte redesign below is a
> structural alternative that should be evaluated as part of a deliberate v1
> breaking-change batch, not shipped in isolation. The first `##` section explains why.

Pre-v1, we *could* widen the shared wire payload from 16 to **20 bytes (160 bits → exactly
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
  *every* codec, *and* it introduces brand-new cryptographic code (a wide-block PRP) that
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

| bytes | bits | base32 chars | vs. today (128-bit) |
| ----- | ---- | ------------ | ------------------- |
| 15    | 120  | 24           | shorter, **below the 128-bit floor** |
| 20    | 160  | 32           | longer, **≥ 128 bits** |

20 bytes is the smallest mod-5 length that does not reduce the entropy floor. It encodes to
exactly 32 chars, so `payloadBase32Length = ⌈20·8/5⌉ = 32` becomes exact and the surplus
bits — and the `base32FinalCharClass` constant — disappear entirely.

## The crypto cost: a 160-bit permutation replaces single-block AES

Two codecs rely on the payload being exactly one 128-bit AES block (ADR-0004): **Opaque**
(`layouts/opaque.ts`) and **Wrapped** (`layouts/wrapped.ts`). The Signed codec is HMAC-only
and adapts trivially. 20 bytes is 1.25 AES blocks; the only length that is both mod-5 and a
whole number of AES blocks is `lcm(5, 16) = 80` bytes (128 chars — impractical). So a mod-5
payload necessarily abandons the single-block strip trick.

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

## Field re-layouts at 20 bytes (free upgrades)

| codec               | today (16 B)                  | proposed (20 B)              | effect            |
| ------------------- | ----------------------------- | ---------------------------- | ----------------- |
| Timestamp / Reverse | `ts6 ‖ rand10` (80-bit rand)  | `ts6 ‖ rand14`               | 112-bit random    |
| Signed              | `ts6 ‖ rand5 ‖ tag5` (40-bit) | `ts6 ‖ rand6 ‖ tag8`         | 64-bit tag        |
| Wrapped             | `lane8 ‖ tag8` (64-bit tag)   | `lane8 ‖ tag12`              | 96-bit tag        |
| Opaque              | `ts6 ‖ rand10`, single-block  | `ts6 ‖ rand14`, Feistel-PRP  | 112-bit random    |

## Considered options

- **Stay at 16 bytes + pin the padding bits (ADR-0003 amendment / PR #211) — ACCEPTED as the
  #210 fix; this ADR is the deferred alternative.** Correct and zero-migration, at the price
  of leaving the surplus bits and a length-specific `[048cgmrw]` final-char class in place.
- **20 bytes + 4-round Feistel wide-block PRP — the recommended form *if* we take the
  redesign.** Clean PRP, reuses the existing single-block primitive, +entropy/+tag bits.
- **20 bytes + AES-CBC ciphertext-stealing (CTS) — fallback.** Smallest delta from the strip
  trick (~2 calls) but hand-rolled (no WebCrypto CTS), CBC-malleable, and a fussier security
  writeup than Feistel for little saving. Documented in case the 4-call cost ever bites.
- **15 bytes / 120 bits — REJECTED.** Shorter IDs, but below the 128-bit entropy floor
  (72-bit Timestamp random tail).
- **80 bytes (mod-5 ∧ mod-16) — REJECTED.** The only length keeping single-block AES *and*
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
- **No code, wire, or `CONTEXT.md` change ships from this ADR.** It records a deferred design
  decision; adoption is a separate, deliberate v1 change.
