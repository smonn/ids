---
"@smonn/ids": minor
---

Add `Codec.minIdForTime(date)` and `Codec.maxIdForTime(date)` for time-range queries against the ID column. Both build a synthetic `Id<Brand>` whose 6-byte timestamp encodes `date` and whose 10 random bytes are filled with `0x00` (min) or `0xFF` (max), giving the tight lower/upper bounds for any ID generated in that millisecond. Date validation matches `generate()` — pre-epoch or past the 48-bit ceiling throws with the same messages. No new RNG calls.

```ts
sql`SELECT * FROM users WHERE id BETWEEN ${users.minIdForTime(start)} AND ${users.maxIdForTime(end)}`;
```
