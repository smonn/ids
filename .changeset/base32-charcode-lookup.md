---
"@smonn/ids": patch
---

`decodeBase32` now uses an indexed `for`-loop with `charCodeAt` and a precomputed `Uint8Array` lookup table instead of `for…of` over the string with `Map.get`. String `for…of` pays a Unicode-surrogate tax per character, and `Map.get` is ~10× slower than an array index for a 32-entry lookup. `decodeBase32` is ~70% faster in local benchmarks; `extractTimestamp` (which uses it) is ~45% faster.

The decoder still accepts uppercase input and Crockford `o`/`i`/`l` aliases — the lookup table includes entries for both cases and the aliases, so behaviour is unchanged.
