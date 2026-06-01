---
"@smonn/ids": patch
---

`encodeBase32` now builds an `Array<number>` of char codes and converts in one shot via `String.fromCharCode.apply`, replacing the previous `result += char` cons-string accumulation. ~45% faster locally; cascades to `generate()` which gains another ~5–10%.

Several alternatives were measured and rejected: `Array.push + join` (~2× slower than the original), `Uint8Array + spread` (~3× slower), `Uint8Array + fromCharCode.apply` (~40% slower than `Array<number>` because `apply`'s fast path is plain-Array-only), hoisting the array module-level (no gain — V8 fast-paths the small allocation), and a fully-unrolled bit-extraction (no faster than the loop — the bottleneck was the string concat, not the loop).
