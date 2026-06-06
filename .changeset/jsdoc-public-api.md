---
"@smonn/ids": patch
---

Add JSDoc to the public codec API. `Codec` and `OpaqueCodec` method tooltips now document the canonical-only `is()` vs lenient `safeParse()` split (ADR-0003), the `extractTimestamp` trust model (ADR-0002), and the opaque codec's async/sync method split.
