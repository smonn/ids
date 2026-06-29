---
"@smonn/ids": major
---

Raise the `@prisma/client` peer floor from `>=5.9.1` to `>=7.0.0`. Prisma 7 relocated the internal type entry point the adapter relies on from `@prisma/client/runtime/library` to `@prisma/client/runtime/client`; the `@smonn/ids/prisma` adapter now imports from the new path. Consumers must be on Prisma 7 or later — Prisma 5/6 are no longer supported.
