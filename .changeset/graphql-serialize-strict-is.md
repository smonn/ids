---
"@smonn/ids": patch
---

`idScalar` `serialize` now validates via `codec.is()` (strict) and throws `GraphQLError` on a non-canonical outbound value instead of silently normalizing it. Error messages for all three hooks (`serialize`, `parseValue`, `parseLiteral`) are coarsened to `invalid <ScalarName>` with no internal parse-error code exposed to clients.
