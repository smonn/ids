---
"@smonn/ids": patch
---

Hono adapter: narrow `options.status` fields from `number` to `ContentfulStatusCode`, removing the unsafe cast that let invalid HTTP status codes reach `HTTPException` unchecked.
