---
"@smonn/ids": patch
---

Widen key-file permission mask from `0o044` to `0o077` so write and execute bits on group/others also trigger the advisory warning.
