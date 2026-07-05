---
"@smonn/ids": patch
---

Fix remaining CLI echo sites that emitted raw user input to stderr: redact `--at` invalid-date values, truncate `--key-encoding`/`IDS_KEY_ENCODING` enum flags, strip `--key-file` path in group-permission warning, and truncate `--bytes` in keygen.
