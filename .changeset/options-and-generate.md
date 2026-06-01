---
"@smonn/ids": patch
---

**Breaking — `Options` reshaped for a zero-allocation `generate()`:**

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
