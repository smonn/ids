---
"@smonn/ids": patch
---

Replace bare string returns from `buildCodec` with a typed `CodecError` discriminant so callers switch on `error.kind` instead of inspecting message text.
