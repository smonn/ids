---
"@smonn/ids": patch
---

Fix GraphQL adapter `serialize` to validate via `codec.safeParse` and throw `GraphQLError` on a non-conforming value instead of an unchecked cast.
