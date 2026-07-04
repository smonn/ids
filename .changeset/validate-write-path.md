---
"@smonn/ids": minor
---

`writeIdColumn` and `writeIdColumnNullable` now validate the value via `codec.safeParse` at the write site and throw `IdsError("invalid_id")` on failure. Previously, a cast-smuggled arbitrary string would be stored unvalidated and cause `IdsError` on every subsequent read. Both helpers now accept `codec` as their first parameter; all five ORM adapters (Drizzle, Kysely, Prisma, TypeORM, MikroORM) are updated accordingly.
