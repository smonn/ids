---
"@smonn/ids": patch
---

Wire parse: case folding is now ASCII-only, matching SPEC canonicalization step 1. Previously `safeParse` used `String.prototype.toLowerCase()`, whose Unicode folding mapped U+212A KELVIN SIGN to `k` and let a Kelvin-containing string alias to a valid ID through the lenient path; that alias class is now rejected (at the base32 layer) as spec compliance. `is()` was already correct and is unchanged. Also fixes rejection-layer classification for overlong input: an oversized value whose prefix is wrong now reports the prefix layer (first-failing-layer rule) instead of always reporting base32; an oversized value with a correct prefix still reports base32. The O(1) length fail-fast is preserved — only the fixed-size prefix slice is inspected when it trips.
