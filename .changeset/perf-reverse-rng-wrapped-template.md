---
"@smonn/ids": patch
---

Performance: bring the Reverse Timestamp codec's `generate` to parity with the Timestamp codec (~2.7× faster, ~1.98µs → ~0.73µs on the local bench). The reverse codec defaulted its random tail to `crypto.getRandomValues`, while the Timestamp codec used a faster `crypto.randomUUID` harvest for the identical 10-byte tail. The harvest fast path is now shared (`fastTenByteRng` in the codec kernel) and used as the default RNG for both codecs. Security-equivalent — both are CSPRNG-backed, fully-random 10-byte tails; only throughput changes. No wire-format or API change; callers passing a custom `rng` are unaffected.

Also precompute the Wrapped key codec's HMAC-message prefix (`len32(brand) ‖ brand ‖ len32(kind) ‖ kind`) once at construction instead of allocating a `TextEncoder` and re-encoding the constant `brand`/`kind` on every `wrap` / `unwrap` trial, matching the Digest and Signed codecs. Per-call message buffers are still freshly allocated, preserving concurrency safety under parallel async signs. Byte-identical output — no wire-format change.
