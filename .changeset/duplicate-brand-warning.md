---
"@smonn/ids": minor
---

`createId(brand)` now emits a one-shot `console.warn` in development when called a second time for the same brand in the same process — almost always a bundling or import bug (two module copies, accidental re-export, a test re-importing without resetting). Subsequent duplicate calls for the same brand stay silent so logs don't spam. The check is gated on `process.env.NODE_ENV !== "production"`, so production keeps the no-op behaviour. `Options` gains an optional `allowDuplicateBrand` flag: when `true`, the call skips both the warning and the brand registry, so tests that intentionally re-create codecs can opt out cleanly.
