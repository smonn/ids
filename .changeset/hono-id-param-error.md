---
"@smonn/ids": minor
---

Add `IdParamError extends HTTPException` to the Hono adapter so `app.onError` handlers can discriminate `brand_mismatch` from `malformed` via `err.reason`.
