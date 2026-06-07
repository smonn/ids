---
"@smonn/ids": patch
---

Bound `ids generate --count` to finite positive integers from 1 through 10000. Invalid, unsafe, or oversized counts now fail before the CLI emits any IDs.
