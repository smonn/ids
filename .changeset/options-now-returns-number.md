---
"@smonn/ids": patch
---

**Breaking:** `Options.now` now returns `number` (ms since Unix epoch) instead of `Date`. The previous contract allocated a `Date` only to immediately call `.getTime()` on it. The default is now `Date.now` instead of `() => new Date()`.

Migration: append `.getTime()` to existing custom `now` implementations, or pass a raw ms value directly.

```ts
// before
createId("usr", { now: () => new Date("2026-01-01") });

// after
createId("usr", { now: () => new Date("2026-01-01").getTime() });
// or
createId("usr", { now: () => 1735689600000 });
```
