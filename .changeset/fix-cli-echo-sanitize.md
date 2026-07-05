---
"@smonn/ids": patch
---

Fix CLI flag-value and file-path echo sites to strip control/bidi/format characters before stderr output; extend redactToken to cover Unicode bidi controls and truncate on code points.
