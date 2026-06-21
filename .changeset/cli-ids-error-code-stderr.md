---
"@smonn/ids": patch
---

CLI now prefixes IdsError stderr output with the stable error code (e.g. `invalid_brand: ...`) so subprocess tests can assert on the contractual code string rather than the non-contractual message text.
