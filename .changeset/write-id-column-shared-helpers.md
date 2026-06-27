---
"@smonn/ids": patch
---

Extract shared `writeIdColumn` and `writeIdColumnNullable` helpers into `adapter-types.ts`; all five ORM adapters (Drizzle, Prisma, Kysely, TypeORM, MikroORM) now delegate their write paths to these helpers. Non-nullable writes throw `IdsError("invalid_id")` if `null` or `undefined` reaches the driver at runtime, closing the silent-propagation gap (#749).
