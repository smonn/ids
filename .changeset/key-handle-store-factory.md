---
"@smonn/ids": patch
---

Add shared `createKeyHandleStore` factory to `_kernel/`; consolidate `brandOfId` guard in CLI inspect handlers; unify `decodeKeyMaterial` to decode-then-catch-wrap with `cause` on `IdsError("invalid_key_encoding", …)`; derive `BASE64URL_MAX_LEN` comment. `IdsError.cause` is widened to `ParseError | Error | undefined`.
