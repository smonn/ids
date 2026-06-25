---
"@smonn/ids": patch
---

Replace bare string returns from `buildCodec` with a typed `CodecError` discriminant so callers switch on `error.kind` instead of inspecting message text. Usage errors from `buildCodec` (missing key env-vars, bad `*_FORMAT` values) that previously exited 1 now correctly exit 2.
