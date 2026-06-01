---
"@smonn/ids": patch
---

Default `rng` now sources entropy from `crypto.randomUUID()` instead of `crypto.getRandomValues()`. Same CSPRNG underneath, but the UUID call has a tight fixed-format fast path in Node 24 (~84 ns vs ~610 ns to fill 16 bytes). We hex-decode 10 fully-random bytes from positions where neither version nor variant bits sit. `generate()` is ~53% faster (791 ns → 375 ns local) and throughput goes from 1.26 M/s to 2.67 M/s. No change to the public API; custom `rng` implementations are unaffected.
