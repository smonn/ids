---
"@smonn/ids": patch
---

**Breaking:** `Options.rng` now takes a buffer to fill instead of a length to allocate. The signature changes from `(bytes: number) => Uint8Array` to `(target: Uint8Array) => void`, matching `crypto.getRandomValues` and Node's `crypto.randomFillSync`.

`createId` allocates a single 16-byte buffer per codec and reuses it across `generate()` calls — the timestamp is written in place, then `options.rng` fills an aliased view over the random portion. No per-call allocation for the buffer, the random bytes, or the copy between them. ~9% faster `generate()` locally.

The codec is now stateful (a buffer that persists between calls), but `generate()` is synchronous and `encodeBase32` produces an independent string before returning — callers never see the buffer itself.

Migration for custom RNGs:

```ts
// before
createId("usr", { rng: (n) => new Uint8Array(n) });
createId("usr", { rng: (n) => new Uint8Array(n).fill(0xff) });

// after
createId("usr", { rng: () => {} }); // target arrives zero-filled the first time
createId("usr", { rng: (target) => target.fill(0xff) });
```
