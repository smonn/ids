---
"@smonn/ids": minor
---

Add `idPlugin(map)` to the Kysely adapter — a `KyselyPlugin` that automatically runs `fromDriver` on configured columns in query results, eliminating per-call-site `fromDriver` invocations.
