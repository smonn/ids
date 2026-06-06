---
"@smonn/ids": patch
---

Add opaque key helpers and CLI support for operating the Opaque codec from the shell. `encodeOpaqueKey` / `decodeOpaqueKey` round-trip key material in hex or base64url. New `keygen` subcommand emits keys; `generate --opaque` and `inspect --opaque` read the key from `IDS_KEY`.
