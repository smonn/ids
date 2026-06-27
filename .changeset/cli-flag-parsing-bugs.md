---
"@smonn/ids": patch
---

Fix CLI flag-parsing bugs: keygen selector flags no longer swallow positionals or accept inline values; `inspect --from-uuid` rejects codec-selector and `--key-format` flags; `--ns` with leading or trailing whitespace is now a usage error.
