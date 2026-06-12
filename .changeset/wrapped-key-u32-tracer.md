---
"@smonn/ids": minor
---

Add `@smonn/ids/wrapped` with the **Wrapped key codec**: `createWrappedKeyId`, `importWrappingKey`, and `encodeWrappingKey` / `decodeWrappingKey` for verified compact wrapping of lookup keys into public IDs (`wrap`, `unwrap`, `safeUnwrap`, plus structural wire methods). Supported lookup key kinds are `u32`, `i32`, `u64`, and `i64`; 32-bit kinds use `number` and 64-bit kinds use `bigint`.
