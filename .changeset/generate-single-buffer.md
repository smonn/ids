---
"@smonn/ids": patch
---

`generate` now writes the timestamp and random bytes into a single 16-byte buffer instead of allocating three separate Uint8Arrays. ~4% faster in local benchmarks.
