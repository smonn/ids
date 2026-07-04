---
"@smonn/ids": patch
---

`idPlugin` now throws at construction when any codec-map key contains a dot, preventing silent wrong-codec application from qualified key collapse.
