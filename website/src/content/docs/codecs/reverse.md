---
title: Reverse Timestamp codec
description: Newest-first sortable branded IDs for descending range scans on forward-only KV stores.
---

Most KV stores (DynamoDB, Cloud Datastore, range-scan KV) only support forward
lexicographic scans natively. The Reverse Timestamp codec bitwise-inverts the
48-bit timestamp field before encoding, so **newer IDs sort lexicographically
before older ones** — reading the most recent entries first becomes a forward
scan.

```ts
import { createReverseTimestampId } from "@smonn/ids/reverse";

const events = createReverseTimestampId("evt");

const id = events.generate(); // "evt_…", sorts newest-first
events.extractTimestamp(id); // Date — inversion is reversed to recover the ms
```

No key material is required, and the inversion is a deterministic byte
transform — `generate`, `generateAt`, and `extractTimestamp` are fully
synchronous, exactly like the [Timestamp codec](/codecs/timestamp/). All the
shared behavior (lenient parsing, errors, Standard Schema, JSON Schema,
deterministic injection) is identical.

## Range bounds are flipped

Because a newer timestamp maps to a lexicographically smaller ID, a time-range
scan over `[t_old, t_new]` passes the **newer** timestamp as the lower bound and
the **older** timestamp as the upper bound:

```ts
const start = new Date("2026-01-01T00:00:00Z"); // older
const end = new Date("2026-02-01T00:00:00Z"); // newer

// Reverse Timestamp: lower bound = newer time, upper bound = older time
sql`SELECT * FROM events WHERE id BETWEEN ${events.minIdForTime(end)} AND ${events.maxIdForTime(start)}`;
```

`minIdForTime(t)` is always the lexicographically smallest ID at millisecond `t`
(random portion all `0x00`) and `maxIdForTime(t)` the largest (all `0xff`).
Under reversal, a newer `t` produces a smaller `minIdForTime` result, so the
bounds swap relative to the Timestamp codec. See
[ADR-0010](https://github.com/smonn/ids/blob/main/docs/adr/0010-reverse-timestamp-inversion.md).

:::caution
The random 10-byte tail is unaffected by the inversion. Two IDs generated in the
same millisecond do not sort deterministically relative to each other — the same
caveat as the Timestamp codec.
:::
