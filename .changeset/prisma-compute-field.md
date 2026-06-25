---
"@smonn/ids": minor
---

Add `computeField(fieldName)` to the Prisma adapter's `IdTransform` so branded `Id<Brand>` types survive `$extends` without a per-call-site cast.
