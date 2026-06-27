---
"@smonn/ids": minor
---

Add `columnType` option to `nullableIdType` (mikro-orm) and `nullableIdColumn` (drizzle PG), and normalize `undefined`→`null` on all four nullable ORM adapter write paths.
