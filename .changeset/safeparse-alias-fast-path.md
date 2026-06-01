---
"@smonn/ids": patch
---

`safeParse` and `parse` now skip the alias-replacement pass entirely when the input contains no `o`/`i`/`l` characters. ~35% faster on canonical input in local benchmarks; lenient input is unchanged.
