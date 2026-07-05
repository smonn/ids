---
"@smonn/ids": patch
---

Fix `sanitize.ts` to use Unicode escape sequences (file was binary due to raw code points); extend `STRIP_RE` with U+2028/U+2029; add unit tests and a repo-wide source-hygiene lint guard.
