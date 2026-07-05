---
status: accepted
created: 2026-06-20
last-updated: 2026-06-26
---

# Reverse Timestamp: bitwise inversion and bound-direction flip

The Reverse Timestamp codec inverts the 48-bit timestamp field before encoding so that lexicographic ID order equals **descending** creation-time order (newest first). This is useful in KV stores (DynamoDB, Cloud Datastore, range-scan KV) where descending range scans are awkward or unavailable and a newest-first key is cheaper than reversing at query time.

## Decision

Invert the 48-bit timestamp field by XOR-ing each of the six timestamp bytes with `0xff` before encoding. `extractTimestamp` reverses the transform by applying the same XOR. The random tail is written unchanged.

This is a deterministic, key-free, synchronous transform that requires no crypto and no new design-acceptance gate — it reuses the Timestamp byte layout with only the timestamp field's bit sense changed.

## `minIdForTime` / `maxIdForTime` bound-direction flip

Because the timestamp is inverted, a newer timestamp produces a lexicographically _smaller_ ID. The bounds retain their lexicographic meanings — `minIdForTime(t)` is the lexicographically smallest ID at millisecond `t`, `maxIdForTime(t)` is the largest — but the mapping from time to position in the sorted key-space is reversed:

| Want                                 | Forward Timestamp     | Reverse Timestamp     |
| ------------------------------------ | --------------------- | --------------------- |
| Range lower bound for [t_old, t_new] | `minIdForTime(t_old)` | `minIdForTime(t_new)` |
| Range upper bound for [t_old, t_new] | `maxIdForTime(t_new)` | `maxIdForTime(t_old)` |

The JSDoc on `minIdForTime` and `maxIdForTime` in `ReverseTimestampCodec` documents this explicitly.

## Considered alternatives

- **Boolean `descending` option on the Timestamp codec** — rejected: violates the codec-variant pattern (ADR-0005). Separate factories, separate subpaths.
- **Caller inversion at query time / separate descending column** — rejected: defeats the "sort from the ID alone" value; callers would need to coordinate the transform everywhere the ID is sorted or scanned.

## Wire-format note

The Reverse Timestamp codec is wire-indistinguishable from the Timestamp and Opaque Timestamp codecs (ADR-0007): the wire shape is `<brand>_` + 26 base32 chars encoding a 16-byte payload. An operator must know which codec variant the brand uses.
