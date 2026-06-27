---
"@smonn/ids": patch
---

Validate the digest key before `generate --digest` blocks on stdin, so a missing or invalid key fails immediately (exit 2) instead of after stdin is read.
