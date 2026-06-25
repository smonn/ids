---
"@smonn/ids": patch
---

Add explicit `types` conditions to all `exports` entries and a top-level `types` field, fixing type resolution for node10 (root) and node16/bundler (all subpaths).
