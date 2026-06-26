---
"@smonn/ids": minor
---

Add UUID interop surface to the CLI: `inspect` now prints a `uuid:` line, `generate --uuid` emits the raw UUID form of each ID, and `inspect --from-uuid <uuid> --brand <brand>` converts a UUID back to a canonical `Id<Brand>`.
