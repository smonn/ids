---
"@smonn/ids": patch
---

Fix `applyInjectOrValidate` sync-throw regression: declare it `async` so `createMany`/`createManyAndReturn` invalid-ID errors surface as rejected promises, restoring pre-#1015 behavior.
