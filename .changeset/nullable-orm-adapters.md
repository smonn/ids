---
"@smonn/ids": minor
---

Add nullable read helpers for all five ORM adapters (`readIdColumnNullable`, `nullableIdColumn`, `nullableIdTransformer`, `nullableIdType`, `readNullable`/`computeNullableField`) so optional foreign keys and `LEFT JOIN` results no longer throw on `null`.
