---
status: rejected
created: 2026-06-21
last-updated: 2026-06-26
---

# 20-byte payload: a wide-block PRP retires the base32 padding bits

> **Status: Rejected (2026-06-24).** Originally _proposed — deferred to v1_; the v1 evaluation happened and the outcome is **rejection**. The project will **stay at 128 bits / 16 bytes / 26 Crockford base32 chars** and reject 20 bytes and every other payload width. The #210 padding bits remain permanently neutralised by the canonical-form constraint in [ADR-0003](./0003-canonical-strict-is.md) — that is the fix, full stop. This ADR and the 20-byte design are retained as the record of _why_ the width is settled, so the question is not reopened. The decision and its reasoning are in the next section; everything after it is the supporting analysis the decision rests on.

## Decision (2026-06-24): stay at 128 bits, reject all other widths

Width is settled at **128 bits**. 20 bytes (and 15, 18, 32, 80, …) are rejected. The chain of reasoning, each link detailed in a section below:

1. **The benefit was never load-bearing.** The #210 hole is already closed by ADR-0003, so this was only ever a quality change. The [collision budget](#the-collision-budget-what-the-random-tail-buys) shows 80 random bits already clears any realistic generation rate; 112 bits only reaches UUIDv4 parity that no deployment observes.
2. **The cost and the benefit point at different codecs.** Under the [promise lens](#field-re-layouts-at-20-bytes--and-which-are-actually-load-bearing), the only codec genuinely strengthened is **Digest** (silent, deterministic content-address collisions) — and Digest is **HMAC-only**, so it would widen for free. The crypto cost (the wide-block PRP) falls entirely on **Opaque** and **Wrapped**, which gain nothing. Paying for new crypto in two codecs to widen a third that needs no crypto is a misaligned trade.
3. **No alternative width is better.** [Intermediate character counts](#why-not-an-intermediate-character-count) (25/27/29) are either unreachable with a whole-byte payload or still carry padding. A **two-AES-block / 256-bit** payload is AES-native but is 52 chars (longer than a UUID), _still_ carries 4 padding bits (32 ∤ 5), and a single CBC pass over two blocks is not a strong wide-block PRP — so it solves nothing and needs a construction anyway. The only length that is both whole-AES-block and zero-padding is 80 bytes / 128 chars — impractical.
4. **128 bits is the cryptographic sweet spot.** It is the _only_ size where the on-wire payload is exactly **one AES PRP application** (`C1 = AES_K(plaintext)` via the ADR-0004 strip trick) — zero construction, the cleanest possible keyed permutation — _and_ the shortest base32 form above the 128-bit entropy floor. Every other size loses one or both: fractional-block sizes (160) force a bespoke Feistel; whole-block sizes (256+) are too long and still padded.
5. **The only construction that "fits" base32 cleanly is disqualified.** Format-preserving encryption (FF1/FF3) is the one standardized way to encrypt directly over a radix-32 domain with no padding, but FF3 and FF3-1 were **withdrawn** from NIST SP 800-38G Rev. 1 (2nd Public Draft, Feb 2025) after repeated tweak-schedule breaks, leaving **FF1 a monoculture**. Binding a _permanent, un-migratable wire format_ to the least-stable corner of standardized symmetric crypto — where breaks have historically forced migration — is unacceptable for an ID library. See [Considered options](#considered-options).
6. **A sync API does not change any of this.** See [Interaction with a possible sync keyed-codec API](#interaction-with-a-possible-sync-keyed-codec-api).

Net: 128 bits is not a compromise the library is stuck with — it is the point that is simultaneously the cleanest crypto, the shortest ID, and adequate on entropy. The width question is closed.

Pre-v1, we _could_ widen the shared wire payload from 16 to **20 bytes (160 bits → exactly 32 Crockford base32 chars, no padding)**. Doing so would supersede the 16-byte invariant ([ADR-0002](./0002-payload-layout.md)) and the AES-CBC single-block strip trick ([ADR-0004](./0004-aes-cbc-strip-trick.md)), and would make the final-character padding-bit constraint ([ADR-0003](./0003-canonical-strict-is.md) amendment, issue #210) unnecessary — there would be no surplus bits to constrain.

## Why it was deferred (and then rejected)

> The reasoning below is what originally justified _deferral_; the fuller v1 evaluation (collision budget, promise lens, alignment geometry, AES-block geometry, FPE collapse — the sections that follow) hardened it into the **rejection** recorded in the Decision section above.

Once the #210 fix (ADR-0003 padding-bit constraint / PR #211) lands, **the security hole is closed**. That removes all urgency from this change: it stops being a security fix and becomes a pure quality improvement (no padding bits by construction, more entropy and larger tags). The cost/benefit then looks like this:

- **Remaining benefits are real but not pressing.** No-padding-by-construction, +32 bits of Timestamp random tail, bigger HMAC tags — all desirable, none of it fixes a live problem once the padding-bit constraint is in place.
- **Costs are large and partly risky.** It invalidates every previously-issued ID across _every_ codec, _and_ it introduces brand-new cryptographic code (a wide-block PRP) that needs its own security review. Shipping new crypto reactively to retire 2 padding bits that are already neutralised is a poor trade.
- **A major breaking change wants to be amortised.** Invalidating all IDs is a once-per-lifetime move pre-v1. If we spend it, we should spend it once — batched with any other breaking changes we want before v1, so consumers migrate a single time.

**Original deferral decision (now superseded):** keep the ADR-0003 padding-bit fix as the canonical resolution of #210 and revisit the 20-byte redesign at v1. That revisit is what produced the rejection above — the entropy bump and structural cleanliness did **not** earn their place once weighed against the cost, the misaligned cost/benefit across codecs, and the absence of any better width. ADR-0003 remains the permanent #210 fix.

## The mathematics

Base32 packs 5 bits per character, so a padding-free payload requires `byteLength % 5 == 0` (the alignment block is `lcm(8, 5) = 40 bits = 5 bytes ↔ 8 chars`). 16 bytes is not a multiple of 5: `128 bits → ⌈128/5⌉ = 26 chars = 130 bits`, leaving **2 surplus bits** in the final character — the root cause of #210. The mod-5 candidates bracketing today's 16 bytes:

| bytes | bits | base32 chars | vs. today (128-bit)                  |
| ----- | ---- | ------------ | ------------------------------------ |
| 15    | 120  | 24           | shorter, **below the 128-bit floor** |
| 20    | 160  | 32           | longer, **≥ 128 bits**               |

20 bytes is the smallest mod-5 length that does not reduce the entropy floor. It encodes to exactly 32 chars, so `payloadBase32Length = ⌈20·8/5⌉ = 32` becomes exact and the surplus bits — and the `base32FinalCharClass` constant — disappear entirely.

### Why not an intermediate character count?

Counting in characters makes the width look like a smooth dial — why not 27, 29, or 31 chars instead of jumping 26 → 32? Because the wire carries a **byte-array** payload shared by all six codecs ([ADR-0007](./0007-wire-indistinguishable-codec-variants.md)), and whole-byte payloads only land on certain char counts. `chars = ⌈8·bytes/5⌉`, so the reachable lengths above today are:

| bytes  | bits    | chars  | padding bits | vs. today (128-bit)          |
| ------ | ------- | ------ | ------------ | ---------------------------- |
| 16     | 128     | 26     | 2            | today                        |
| 17     | 136     | 28     | 4            | more padding                 |
| **18** | **144** | **29** | **1**        | **smallest nonzero padding** |
| 19     | 152     | 31     | 3            | more padding                 |
| 20     | 160     | 32     | 0            | clean ✓                      |

Two consequences fall out:

- **Odd char counts like 25 and 27 are unreachable** with a whole-byte payload: 25 bits-capacity (125) is below the 128-bit floor _and_ 15.625 bytes; 27 (135 bits) sits between 16 bytes (26 ch) and 17 bytes (28 ch) and corresponds to no integer byte length. Hitting them would require a sub-byte payload, which breaks the block-aligned AES codecs (Opaque, Wrapped) far worse than the 20-byte Feistel does, for 2–7 bits of entropy the collision budget shows nobody needs.
- **18 bytes / 29 chars is the only byte-aligned intermediate**, and the most interesting of the lot: it carries just **1** padding bit (vs. today's 2) and is 3 chars shorter than 20 bytes. But it still does not eliminate padding by construction — so it keeps a (smaller) `base32FinalCharClass` constraint and the #210 surplus-bit machinery alive, defeating the structural point of the redesign — while its 144-bit payload (112-bit Timestamp random, same as 20 bytes' headline) buys nothing the 20-byte layout doesn't, and leaves no clean home for Digest's `digest` width. It is strictly a worse 20 bytes: still new crypto (144 is not an AES block either), still a non-zero surplus, fewer free bits.

The next zero-padding, byte-aligned, above-floor length after 26 chars is therefore **32 chars / 20 bytes, full stop** — which is why this ADR frames the decision as "16 vs 20 bytes" and never as a character count.

## The collision budget: what the random tail buys

The base32 alignment above is about surplus _padding_ bits. The field re-layouts below also move the _entropy_ floor: the Timestamp and Reverse codecs' random tail grows **80 → 112 bits** (`rand10 → rand14`). This section quantifies that, because the entropy bump — not the padding cleanup — is the load-bearing reason to take the redesign at v1, and the ADR otherwise asserts it without a number.

Collisions only matter **within one timestamp bucket**: two IDs with different plaintext 48-bit millisecond timestamps cannot collide, so all collision resistance rests on the random tail drawn _per millisecond_. For `r` random bits and `n` IDs in one bucket, the birthday bound gives `p ≈ n² / 2^(r+1)`. Going 80 → 112 multiplies the random space by `2³² ≈ 4.3 × 10⁹`, dividing per-bucket collision probability by that same factor at any fixed load:

| IDs in one ms | (≈ IDs/sec) | r = 80 (today) | r = 112 (20-byte) |
| ------------- | ----------- | -------------- | ----------------- |
| 1,000         | 1 M/s       | 4.1 × 10⁻¹⁹    | 9.6 × 10⁻²⁹       |
| 10,000        | 10 M/s      | 4.1 × 10⁻¹⁷    | 9.6 × 10⁻²⁷       |
| 100,000       | 100 M/s     | 4.1 × 10⁻¹⁵    | 9.6 × 10⁻²⁵       |
| 1,000,000     | 1 B/s       | 4.1 × 10⁻¹³    | 9.6 × 10⁻²³       |

The decision-useful framing is the **sustained generation rate that keeps the summed annual collision probability under a fixed budget** (here, ≤ 1-in-10⁹ per year, across the ~3.15 × 10¹⁰ ms in a year):

| random tail           | sustained rate under 1e-9 / year      |
| --------------------- | ------------------------------------- |
| **r = 80 (today)**    | ~277 IDs/ms ≈ **277,000 IDs/sec**     |
| **r = 112 (20-byte)** | ~18 M IDs/ms ≈ **18 billion IDs/sec** |

At 80 bits the budget is ~277k IDs/sec _sustained on a single brand for a year_ — high, but a large multi-tenant system at peak can approach it. At 112 bits it is ~18 billion/sec, past any real-world generator. The upgrade converts "a bound you could theoretically hit" into "a bound nobody hits."

**Where this lands vs. prior art.** Normalising for time resolution (millisecond buckets are worth ~10 bits over the 1-second buckets KSUID uses), in per-second-bucket-equivalent terms: today's tail is `80 + 10 ≈ 90` effective bits; the 20-byte tail is `112 + 10 ≈ 122` — essentially [UUIDv4](https://www.rfc-editor.org/rfc/rfc9562) parity (122 random bits) and within ~6 bits of [KSUID](https://github.com/segmentio/ksuid)'s 128 — but in a 32-char string rather than KSUID's 27 base62 or UUID's 36 hex. KSUID itself needs 128 random bits precisely because its 1-second bucket is ~1000× coarser than a millisecond one; finer resolution is why ULID (and this codec) get away with less. The 20-byte width buys UUIDv4-grade collision resistance while staying shorter than both.

**This is a comfort/margin upgrade, not a fix.** Reaching 1e-9/year at 80 bits takes ~277k IDs/sec sustained for a year — so 80 bits is not a live problem, exactly as the security analysis concludes the padding hole is already closed. The strongest argument for the bump is not "80 is unsafe" but "112 retires the collision-rate conversation from the docs permanently, the way UUIDv4 and KSUID users never have it." (The Signed/Wrapped tag-width changes below are a separate _forgery_-resistance budget, not collision resistance, and are not modelled here.)

## Decision crux: the Signed random field, not the tag, forces the width

The budget above covers the plaintext Timestamp/Reverse tail (80 → 112). The Signed codec splits its 80-bit tail two ways — `ts6 ‖ rand5 ‖ tag5` (40 random / 40 tag, [ADR-0012](./0012-signed-timestamp-construction.md)) — and that split is where the 20-byte question is actually decided. Worked against realistic sustained load on one brand, both axes land opposite to intuition:

- **The 40-bit tag is not thin.** Forgery is online-only — the signing key never leaves the server, so there is no offline brute force — succeeding at `n / 2⁴⁰` per live `verify`. One forgery needs ~10¹² failing requests, i.e. **years of endpoint saturation** even at 10⁴–10⁶ verify/s, and a forged tag only proves "minted by the key," not a capability. 40 bits clears the bar twice over.
- **The 40-bit random field is the binding constraint.** Same-millisecond collisions accumulate over a year: at ~1,000 IDs/s on one brand, 40-bit random expects **~1.4 × 10⁻² collisions/year** — far closer to the edge than the tag's "years per forgery."

Inside 16 bytes the tail is zero-sum, so **no re-budget fixes this**: growing the tag shrinks the already-tight random field, and the only collision-favouring split (48 random / 32 tag) reuses the 32-bit tag width [ADR-0009](./0009-wrapped-key-compact-construction.md) rejected as too weak. 20 bytes is the only construction that relieves the tight axis without robbing the tag (`ts6 ‖ rand6 ‖ tag8` → 48 random / 64 tag, both widened at once).

Whether that relief is load-bearing turns on a single severity question — and crucially **not** the one the codec's headline framing first suggests. Signed is advertised for share links _verified without a DB lookup_, but that describes stateless **authenticity** (no round-trip to check the tag); it is independent of whether a **persisted, unique-indexed row** exists to catch a collision:

- **Persisted, unique-indexed ID** — the common share-link shape: a stored grant/share row with a target, expiry, and revocation state. A collision is a caught insert error → regenerate. The lenient bar applies; 40-bit random comfortably serves ~835 IDs/s/brand, and **20 bytes is pure margin: stay at 16.** Verifying the tag statelessly does not change this — the row still backstops collisions.
- **Genuinely storeless signed capability** — the tag alone is the authorization, nothing persisted. A collision is silent; the stringent bar applies and 40-bit random covers only ~8 IDs/s/brand. **That profile — storeless _and_ high single-brand volume — is the lone load-bearing reason to take the width change at v1.**

So the v1 decision reduces to: _does the Signed codec promise correctness for storeless, high-volume single-brand use?_ The dominant advertised use — a share link backed by a stored grant — lands on the **first** bullet, so the realistic answer is usually "no, collisions are caught." That makes the 20-byte collision relief **non-load-bearing for most Signed deployments**, forcing the width only at the storeless high-volume tail. The Signed random field is still the _only_ axis that could force it — neither the tag nor the plaintext-Timestamp entropy can — but the codec's own suggested use places most of its weight on the side where 16 bytes already suffices.

## The crypto cost: a 160-bit permutation replaces single-block AES

Two codecs rely on the payload being exactly one 128-bit AES block (ADR-0004): **Opaque** (`layouts/opaque.ts`) and **Wrapped** (`layouts/wrapped.ts`). The Signed codec is HMAC-only and adapts trivially.

> **Correction (2026-06-24):** The [ADR-0018](./0018-by-feature-codec-slices.md) slice refactor retired the `layouts/` directory. These files now live at `src/codecs/opaque/layout.ts` and `src/codecs/wrapped/layout.ts`.

20 bytes is 1.25 AES blocks; the only length that is both mod-5 and a whole number of AES blocks is `lcm(5, 16) = 80` bytes (128 chars — impractical). So a mod-5 payload necessarily abandons the single-block strip trick.

Both AES codecs are deterministic by design (Wrapped maps a lookup key to a stable ID; Opaque accepts determinism per ADR-0004), and a randomised/AEAD construction still does not fit in 20 bytes — a safe nonce (~96 bits) plus ciphertext leaves too little room for `ts6 + meaningful random`, and a 32-bit nonce collides at ~2¹⁶ IDs. So we still want a **deterministic, keyed, length-preserving permutation**, just over 160 bits instead of 128.

**Recommended construction — 4-round balanced Feistel (a 160-bit strong PRP).** Split the 160-bit block into two 80-bit (10-byte) halves; the round function is `first80bits(AES_K(roundIndex ‖ R ‖ pad))`, computed with the existing "AES-CBC, IV=0, take the first 16 bytes" single-block primitive already used in `opaque.ts` / `wrapped.ts`. Four rounds give a Luby–Rackoff strong PRP. This is the direct generalisation of ADR-0004's "128-bit permutation under the key" to 160 bits, reusing the same primitive with no new dependency or bundle weight. Cost: 4 SubtleCrypto calls per encrypt/decrypt (vs. 1/2 today), sequential within a Feistel — acceptable for these explicitly low-throughput async codecs. The determinism + high-entropy-plaintext IND-CPA argument from ADR-0004 carries over unchanged; integrity stays where it belongs (HMAC tag for Wrapped/Signed, none for Opaque).

> **Correction (2026-06-24):** `opaque.ts` and `wrapped.ts` were relocated by the [ADR-0018](./0018-by-feature-codec-slices.md) slice refactor; they now live at `src/codecs/opaque/layout.ts` and `src/codecs/wrapped/layout.ts`.

### Interaction with a possible sync keyed-codec API

A sync keyed-codec variant (the **Sync keyed codec** idea in [IDEAS.md](../IDEAS.md), deferred by [ADR-0006](./0006-async-keyed-codec-contract.md)) would pull in a pure-JS AES/HMAC dependency — and it is tempting to think that discounts this Feistel ("we'd have a crypto lib anyway"). It does not:

- **The "no new dependency" pro above is contingent, not load-bearing.** If a pure-JS crypto dep ever enters for sync, that argument simply dissolves — neutral either way.
- **The only real improvement would be a standardized wide-block / FPE primitive (e.g. FF1)** shipped by that dep, replacing this hand-rolled Feistel and softening the "net-new bespoke crypto" objection. But the obvious sync libs provide AES modes and HMAC, **not** audited FPE; an unvetted FF1/FF3 package is worse than a reviewed Feistel on a trusted AES. So this upside is not bankable.
- **Sync makes 20 bytes marginally _more_ expensive, not less.** Once both async (WebCrypto) and sync (pure-JS) backends exist, the keyed construction lives in both — the wide-block Feistel ×2 instead of today's simpler single-block strip trick ×2. The 16→20 crypto delta is paid twice.
- **The one load-bearing 20-byte benefit (Digest) is independent of all this.** Digest is HMAC-only: a 160-bit digest is just a longer truncation, needs no wide-block PRP, and is the _easy_ sync case.

These are different kinds of change — sync is additive and non-breaking, 20 bytes is a hard v1 break — so they should not be batched. If both ever happen, sequence sync first (driven by a real consumer) and let the chosen library reveal whether a standardized PRP is actually available before committing the 20-byte crypto to a hand-rolled one.

## Field re-layouts at 20 bytes — and which are actually load-bearing

| codec | today (16 B) | proposed (20 B) | effect |
| --- | --- | --- | --- |
| Timestamp / Reverse | `ts6 ‖ rand10` (80-bit rand) | `ts6 ‖ rand14` | 112-bit random |
| Signed | `ts6 ‖ rand5 ‖ tag5` (40-bit) | `ts6 ‖ rand6 ‖ tag8` | 64-bit tag |
| Wrapped | `lane8 ‖ tag8` (64-bit tag) | `lane8 ‖ tag12` | 96-bit tag |
| Opaque | `ts6 ‖ rand10`, single-block | `ts6 ‖ rand14`, Feistel-PRP | 112-bit random |
| **Digest** | `digest16` (128-bit truncation) | `digest20` | **160-bit digest** |

> **Added (2026-06-24).** The Digest codec ([ADR-0017](./0017-digest-codec-construction.md)) postdates this ADR and was missing from the table. Its entire payload is a truncated `HMAC(key, brand ‖ ns ‖ material)` — no timestamp, no random field — so 20 bytes widens the digest itself, `128 → 160` bits. This row turns out to carry the only load-bearing benefit; the rest do not, per the promise lens below.

### What the advertised promise makes of each upgrade

Calling these "free upgrades" overstates them. Weighed against each codec's _advertised promise_, the entropy/tag gains are margin on axes that are already adequate — **except one**:

- **Timestamp / Reverse — margin.** These are public **entity** IDs, always persisted under a unique index, so a same-ms collision is a caught insert error with vast headroom already (80-bit random clears ~277k IDs/s/brand at 1e-9/yr). 112 bits changes nothing observable.
- **Signed — margin in the common case** (stored grant row → caught), load-bearing only at the storeless high-volume tail (see the decision-crux section above).
- **Wrapped — no benefit.** Deterministic, so it has no collision axis at all; its 64-bit tag is online-only and already astronomically strong (~585k yr per forgery at 10⁶ verify/s). The lane that holds the wrapped key does **not** grow. 96-bit tag buys nothing the promise needs.
- **Opaque — no benefit.** Its promise is **confidentiality**, which is orthogonal to random-tail width; hiding the timestamp rests on the keyed permutation, not entropy. More random bits do not strengthen the promise.
- **Digest — the lone genuine strengthening.** A Digest collision _is_ the failure of its whole reason to exist (two distinct inputs → one content-address / idempotency key / pseudonym), and it is the worst-severity regime by construction: **deterministic** (no regenerate-to-escape) and **silent** (lookups are keyed by the digest, nothing backstops it). Collision resistance is purely the truncation width — birthday `2⁶⁴ → 2⁸⁰` (128 → 160 bits). Content-addressing convention leans ≥160 bits (Git chose 160 then 256 deliberately); 128-bit Digest sits at the low end of that norm, and 20 bytes brings it to parity. _Magnitude caveat:_ 128 bits still holds <1e-9 accidental collisions to ~8 × 10¹⁴ distinct inputs, so this is load-bearing only at extreme content-address scale — but it is the one place running at the low end of the convention is genuinely undesirable.

**The cost lands where the benefit is absent.** The two codecs that must pay for 20 bytes — Opaque and Wrapped, the AES codecs that trade the single-block strip trick for the new Feistel PRP and its review burden — are exactly the two that gain nothing from it. The one codec whose promise the width genuinely serves, Digest, is HMAC-only and would widen **for free** (no new crypto). So the honest v1 framing is: _the load-bearing case for 20 bytes is Digest's content-address collision resistance, and taking it means imposing a net-new wide-block PRP on two unrelated codecs to widen a third that needs no crypto change at all._ Whether Git-grade Digest resistance is worth that coupling is the real decision.

## Considered options

- **Stay at 16 bytes + pin the padding bits (ADR-0003 amendment / PR #211) — ACCEPTED as the #210 fix; this ADR is the deferred alternative.** Correct and zero-migration, at the price of leaving the surplus bits and a length-specific `[048cgmrw]` final-char class in place.
- **20 bytes + 4-round Feistel wide-block PRP — the recommended form _if_ we take the redesign.** Clean PRP, reuses the existing single-block primitive, +entropy/+tag bits.
- **20 bytes + AES-CBC ciphertext-stealing (CTS) — fallback.** Smallest delta from the strip trick (~2 calls) but hand-rolled (no WebCrypto CTS), CBC-malleable, and a fussier security writeup than Feistel for little saving. Documented in case the 4-call cost ever bites.
- **15 bytes / 120 bits — REJECTED.** Shorter IDs, but below the 128-bit entropy floor (72-bit Timestamp random tail).
- **80 bytes (mod-5 ∧ mod-16) — REJECTED.** The only length keeping single-block AES _and_ zero padding, but 128-char IDs are a non-starter.
- **CTR-family / FPE (FF1/FF3) — REJECTED.** CTR with a fixed/derived counter degenerates or risks keystream reuse (ADR-0004 already rejected the CTR family). FPE is the one standardized way to encrypt directly over a radix-32 domain with zero padding at any character count — the theoretically cleanest "fit base32" answer — but it is disqualified on durability, not just bundle weight: **FF3 and FF3-1 were withdrawn from NIST SP 800-38G Rev. 1 (2nd Public Draft, Feb 2025)** after repeated tweak-schedule breaks (Durak–Vaudenay on FF3; Beyne on FF3-1), leaving **FF1 a monoculture** with scarce audited implementations (the popular libraries implement the now-withdrawn FF3). Implementation is also harder to get right than a plain bit-width Feistel: round-trip tests do not catch non-conformant radix/big-int arithmetic, domain size is a security parameter, and constant-time base conversion is hard. Binding a permanent, un-migratable wire format to the least-stable corner of standardized symmetric crypto is the opposite of what an ID library wants.

## Consequences (if adopted at v1)

- **Breaking:** every previously-issued ID across every codec is invalidated. Acceptable pre-v1; would not be post-v1. Changeset would be **major**.
- `payloadByteLength = 20`, `payloadBase32Length = 32` (exact); **`base32FinalCharClass` is deleted** and the ADR-0003 padding-bit amendment is reverted — no surplus bits exist.
- Field re-layouts: Timestamp/Reverse random 80→112, Signed tag 40→64, Wrapped tag 64→96, **Digest 128→160**. Per the promise lens above these are mostly margin (caught-collision or already-strong online-only tags); the one load-bearing gain is Digest's content-address collision resistance, and it accrues to the only codec needing no crypto change.
- A new internal wide-block-PRP module under `wire/` (or `layouts/`), requiring its own security review. [ADR-0004](./0004-aes-cbc-strip-trick.md) would be marked **superseded** and [ADR-0002](./0002-payload-layout.md) rewritten for the new length.

  > **Correction (2026-06-24):** The `layouts/` directory was retired by [ADR-0018](./0018-by-feature-codec-slices.md). Under the current structure a wide-block-PRP module would live at `src/codecs/<name>/layout.ts` (or a shared `wire/` module), not under a `layouts/` directory.

- **No code, wire, or `CONTEXT.md` change ships from this ADR.** It records a deferred design decision; adoption is a separate, deliberate v1 change.
