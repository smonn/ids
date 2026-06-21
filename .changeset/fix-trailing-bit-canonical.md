---
"@smonn/ids": patch
---

Fix: `is()` and `safeParse()` now reject non-canonical trailing-bit variants (final base32 char must have zero low 2 bits).
