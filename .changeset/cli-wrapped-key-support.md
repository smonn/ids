---
"@smonn/ids": minor
---

Add CLI support for the Wrapped key codec: `keygen --wrapped` emits wrapping key material, and `inspect --wrapped --kind <u32|i32|u64|i64>` recovers the lookup key from a wrapped ID via `IDS_WRAPPING_KEY`.
