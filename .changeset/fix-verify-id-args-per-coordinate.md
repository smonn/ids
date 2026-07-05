---
"@smonn/ids": patch
---

Fix `verifyIdArgs` arg-name guard to check per schema coordinate (`parentType.name.fieldName`) instead of once per wrapper, so a shared resolver mounted on two fields correctly validates each field's declared arguments independently.
