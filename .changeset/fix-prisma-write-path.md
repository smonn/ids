---
"@smonn/ids": patch
---

Fix Prisma write path: defaultQuery now validates present IDs in create/createMany/upsert; nullableIdField().write now accepts null/undefined and returns null instead of throwing.
