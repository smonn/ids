---
"@smonn/ids": minor
---

Introduce nominal `OpaqueKey` type for the Opaque Timestamp codec. `importOpaqueKey` now returns `Promise<OpaqueKey>` instead of `Promise<CryptoKey>`, and `OpaqueTimestampOptions.key` is typed as `OpaqueKey`. Mirrors the `WrappingKey` pattern from `@smonn/ids/wrapped`. Pre-v1 breaking change — callers must obtain a key handle via `importOpaqueKey(bytes)` rather than passing a raw `CryptoKey`.
