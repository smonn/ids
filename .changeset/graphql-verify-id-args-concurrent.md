---
"@smonn/ids": patch
---

`verifyIdArgs` now verifies present GraphQL id args concurrently instead of sequentially, cutting resolver latency from N sequential WebCrypto round-trips to one overlapping round. Error reporting still names the first failing arg in codec-map order.
