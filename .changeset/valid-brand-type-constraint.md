---
"@smonn/ids": minor
---

Add `ValidBrand` type and enforce 3-character brand constraint at the type level.

`ValidBrand` is now exported from `"@smonn/ids"`. All codec factory functions (`createTimestampId`, `createOpaqueTimestampId`, `createReverseTimestampId`, `createSignedTimestampId`, `createWrappedKeyId`, `createDigestId`) and their associated type aliases now constrain `Brand extends ValidBrand` instead of `Brand extends string`, so passing a brand that is not exactly three lowercase a–z characters is a compile-time error.
