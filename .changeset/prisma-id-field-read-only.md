---
"@smonn/ids": minor
---

Add `idFieldReadOnly` to `@smonn/ids/prisma` — a read-only sibling of `idField` that accepts any `IdColumnCodec` (no synchronous `generate()` required) and returns the full read/transform surface minus `defaultQuery`.
