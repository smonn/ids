---
"@smonn/ids": patch
---

`extractTimestamp` now decodes only the first 10 base32 characters (the bytes carrying the timestamp) instead of the entire 26-character payload. ~60% faster in local benchmarks; no behavioural change.
