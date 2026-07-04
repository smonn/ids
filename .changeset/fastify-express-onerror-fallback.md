---
"@smonn/ids": patch
---

Fix Fastify and Express idParam/idQuery onError fall-through: log-only hooks no longer allow the route handler to run with an invalid ID.
