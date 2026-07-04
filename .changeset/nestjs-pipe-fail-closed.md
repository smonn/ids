---
"@smonn/ids": patch
---

Fix NestJS `ParseIdPipe` to throw the default exception after a non-throwing `onError` hook returns, preventing fail-open behavior on both the structural-parse and verify branches.
