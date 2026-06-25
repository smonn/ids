---
"@smonn/ids": patch
---

Fix NestJS `ParseIdPipe` so the default exception block is skipped when a caller-supplied `onError` hook is provided.
