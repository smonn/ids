---
"@smonn/ids": minor
---

Add `Codec.generateAt(date)` for minting an ID at a caller-supplied timestamp. The 6-byte timestamp portion is encoded from the supplied `Date`; the 10-byte random portion is filled by the codec's `rng`, so the result is canonical and round-trips through `extractTimestamp` exactly. Validation matches `generate()`: pre-epoch dates, dates past the 48-bit ceiling, and `Invalid Date` (`NaN`) all throw. This closes the gap that previously forced migration scripts and test fixtures to construct a throwaway codec with a fake `now` per timestamp — backfilling from UUIDv7 / ULID / Snowflake is now a few lines of user code.
