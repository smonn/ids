---
"@smonn/ids": patch
---

`encodeBase32` and `decodeBase32` rewritten for performance.

`decodeBase32` swaps `for…of` over the string + `Map.get(char.toLowerCase())` for an indexed `for`-loop with `charCodeAt` and a precomputed 256-entry `Uint8Array` lookup. String `for…of` pays a Unicode-surrogate tax per character, and `Map.get` is ~10× slower than an array index for a small alphabet. The lookup table still accepts uppercase input and Crockford `o`/`i`/`l` aliases — behaviour is unchanged.

`encodeBase32` swaps the `result += char` cons-string accumulation for writes into an `Array<number>` of char codes, finalised in one shot via `String.fromCharCode.apply(null, codes)`.

Local benchmarks: `decodeBase32` −74%, `encodeBase32` −46%. `extractTimestamp` (which uses `decodeBase32`) cascades down another ~35%.

Several alternatives were measured and rejected during development: `Array.push + join` (~2× slower), `Uint8Array` + spread (~3× slower), `Uint8Array` + `fromCharCode.apply` (~40% slower than `Array<number>`), hoisting the codes array module-level (no gain — V8 fast-paths the small allocation), and a fully-unrolled bit extraction (no faster than the loop — the bottleneck was string concat, not the loop form).
