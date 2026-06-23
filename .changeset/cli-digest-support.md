---
"@smonn/ids": minor
---

Add CLI support for the Digest codec: `ids keygen --digest` emits digest key material, `ids generate <brand> --digest --ns <ns>` reads material from stdin and produces a deterministic ID via `IDS_DIGEST_KEY`. Digest IDs are one-way; `inspect --digest` is unsupported by design.
