---
"@smonn/ids": major
---

Rename CLI `IDS_KEY` → `IDS_OPAQUE_KEY` (and `IDS_KEY_FORMAT` → `IDS_OPAQUE_KEY_FORMAT`) for the Opaque codec; the freed `IDS_KEY` / `IDS_KEY_FORMAT` become a primary-secret fallback for all four keyed subcommands (opaque, wrapped, signed, digest).
