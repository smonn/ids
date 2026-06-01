# @smonn/ids

## 0.0.2

### Patch Changes

- 4ac58fc: Correct the README's description of the default `rng`: it's an entropy harvester built on `crypto.randomUUID`, not a wrapper around `crypto.getRandomValues`.

## 0.0.1

### Patch Changes

- 424ac97: `encodeBase32` and `decodeBase32` rewritten for performance.

  `decodeBase32` swaps `for…of` over the string + `Map.get(char.toLowerCase())` for an indexed `for`-loop with `charCodeAt` and a precomputed 256-entry `Uint8Array` lookup. String `for…of` pays a Unicode-surrogate tax per character, and `Map.get` is ~10× slower than an array index for a small alphabet. The lookup table still accepts uppercase input and Crockford `o`/`i`/`l` aliases — behaviour is unchanged.

  `encodeBase32` swaps the `result += char` cons-string accumulation for writes into an `Array<number>` of char codes, finalised in one shot via `String.fromCharCode.apply(null, codes)`.

  Local benchmarks: `decodeBase32` −74%, `encodeBase32` −46%. `extractTimestamp` (which uses `decodeBase32`) cascades down another ~35%.

  Several alternatives were measured and rejected during development: `Array.push + join` (~2× slower), `Uint8Array` + spread (~3× slower), `Uint8Array` + `fromCharCode.apply` (~40% slower than `Array<number>`), hoisting the codes array module-level (no gain — V8 fast-paths the small allocation), and a fully-unrolled bit extraction (no faster than the loop — the bottleneck was string concat, not the loop form).

- 424ac97: `extractTimestamp` now decodes only the first 10 base32 characters (the bytes carrying the timestamp) instead of the entire 26-character payload. ~60% faster in local benchmarks; no behavioural change.
- 424ac97: Drop the `invariant` helper and inline `if (...) throw new Error(...)` checks where they remain. V8 declines to inline functions that contain `throw`, so each `invariant()` call cost ~10ns of un-amortised function-call overhead.

  Internal-only base32 functions no longer validate their input — callers in `id.ts` already guarantee shape (16 bytes for `encodeBase32`, alphabet characters for `decodeBase32`), and `Id<Brand>` provides a typed contract for `extractTimestamp` per ADR-0003. Bad input now produces silent garbage rather than a thrown error, which is consistent with the trust-the-type rule applied elsewhere.

  `decodeBase32` and `extractTimestamp` are ~5% faster as a result.

- 424ac97: **Breaking — `Options` reshaped for a zero-allocation `generate()`:**
  - `Options.now`: `() => Date` → `() => number` (ms since Unix epoch). The previous contract allocated a `Date` only to immediately call `.getTime()` on it. Default is now `Date.now`.
  - `Options.rng`: `(bytes: number) => Uint8Array` → `(target: Uint8Array) => void`. Matches `crypto.getRandomValues` and Node's `crypto.randomFillSync`. Custom RNGs no longer have to allocate.

  `createId` now allocates one 16-byte buffer per codec and an aliased 10-byte view over the random portion. `generate()` writes the timestamp into the buffer, then `options.rng(view)` fills the random tail in place. Zero allocations beyond the result string. The codec is stateful, but `generate()` is synchronous and `encodeBase32` produces an independent string before returning — the buffer is never exposed to callers.

  The default `rng` now sources entropy from `crypto.randomUUID()` instead of `crypto.getRandomValues()`. Same CSPRNG underneath, but `randomUUID` has a fixed-format fast path in Node 24 (~84 ns vs ~610 ns to fill 16 bytes). We hex-decode 10 fully-random bytes from positions where neither the version (hex 12) nor variant (hex 16) bits sit — bytes 0–5 from `string[0..7]+string[9..12]`, bytes 6–9 from `string[24..31]`. Custom `rng` implementations are unaffected.

  Combined effect on `generate()`: ~1.04 µs → ~333 ns locally (−68%); throughput from 1.04 M/s to 3.00 M/s.

  Migration:

  ```ts
  // before
  createId("usr", {
    now: () => new Date("2026-01-01"),
    rng: (n) => new Uint8Array(n),
  });

  // after
  createId("usr", {
    now: () => new Date("2026-01-01").getTime(), // or just a raw ms number
    rng: (target) => {}, // target arrives zero-filled the first time
  });
  ```

- 424ac97: `safeParse` and `parse` now skip the alias-replacement pass entirely when the input contains no `o`/`i`/`l` characters. ~35% faster on canonical input in local benchmarks; lenient input is unchanged.
