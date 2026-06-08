---
"@smonn/ids": minor
---

Rename timestamp-family codec APIs before v1. The main-entry factory is now `createTimestampId` with `TimestampCodec` / `TimestampOptions`, and the opaque subpath factory is now `createOpaqueTimestampId` with `OpaqueTimestampCodec` / `OpaqueTimestampOptions`.
