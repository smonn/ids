---
"@smonn/ids": minor
---

Adapter surface consistency: `@smonn/ids/graphql` now re-exports `IdsError`, `isIdsError`, and `IdsErrorCode` for parity with the other adapters (catch-and-narrow without a second import), and `@smonn/ids/prisma` exposes the `computeField()` return shape as a named `IdComputeField<Brand>` type alongside `IdTransform<Brand>`. Both are additive — no existing export changed.
