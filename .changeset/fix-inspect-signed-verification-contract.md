---
"@smonn/ids": patch
---

fix(cli): unify inspect --signed verification contract — stdout always carries the report, stderr carries the diagnostic, exit code carries pass/fail; missing and malformed keys now exit 1 with `verification: unavailable` instead of silently exiting 0.
