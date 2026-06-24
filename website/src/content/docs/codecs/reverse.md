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
synchronous, exactly like the [Timestamp codec](/codecs/timestamp/).

## Methods

| Method                 | Description                                                                                                                        |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `generate()`           | Produces a new canonical ID using the codec's `now` and `rng`.                                                                     |
| `generateAt(date)`     | Produces a new canonical ID at `date`; throws on invalid dates.                                                                    |
| `is(value)`            | Strict type guard — `true` only for already-canonical strings. For untrusted input, use `safeParse()`.                             |
| `parse(value)`         | Lenient parse that normalises case and Crockford aliases; throws on failure.                                                       |
| `safeParse(value)`     | Lenient parse that returns `{ ok: true, id }` or `{ ok: false, error }` without throwing.                                          |
| `extractTimestamp(id)` | Inverts the timestamp bytes back to recover the original creation `Date`. Trusts the type — use `safeParse()` at boundaries first. |
| `minIdForTime(date)`   | Lexicographically smallest ID for any ID generated at `date` (random portion `0x00`). Throws on invalid dates.                     |
| `maxIdForTime(date)`   | Lexicographically largest ID for any ID generated at `date` (random portion `0xff`). Throws on invalid dates.                      |
| `toJsonSchema()`       | Returns a JSON Schema object for the canonical wire form.                                                                          |
| `~standard`            | Standard Schema v1 validate entry point.                                                                                           |

`IdsError`, `isIdsError`, and `IdsErrorCode` are also re-exported from
`@smonn/ids/reverse` for convenience, so you don't need a second import from
`@smonn/ids` just to handle errors.

## Range bounds are flipped

`minIdForTime(date)` and `maxIdForTime(date)` build synthetic IDs at the tight
lower and upper bounds of the given millisecond — same timestamp bytes, random
portion all `0x00` (min) or all `0xff` (max). Because timestamps are inverted, a
**newer** `date` yields a lexicographically **smaller** result, and an **older**
`date` yields a lexicographically **larger** one. That flips the range-scan bounds
relative to the Timestamp codec:

```ts
const start = new Date("2026-01-01T00:00:00Z"); // older
const end = new Date("2026-02-01T00:00:00Z"); // newer

// Reverse Timestamp: lower bound = newer time, upper bound = older time
sql`SELECT * FROM events WHERE id BETWEEN ${events.minIdForTime(end)} AND ${events.maxIdForTime(start)}`;
```

See
[ADR-0010](https://github.com/smonn/ids/blob/main/docs/adr/0010-reverse-timestamp-inversion.md).

:::caution
The random 10-byte tail is unaffected by the inversion. Two IDs generated in the
same millisecond do not sort deterministically relative to each other — the same
caveat as the Timestamp codec.
:::

All date-taking methods (`generateAt`, `minIdForTime`, `maxIdForTime`) throw if
passed a pre-epoch date (before 1 January 1970 UTC), a date past the 48-bit
ceiling (~10 889 AD), or an `Invalid Date`.

## Deterministic tests

Inject a fixed clock and RNG for snapshot-friendly output. Both fields are
optional; `now` defaults to `Date.now` and `rng` defaults to
`crypto.getRandomValues`:

```ts
const events = createReverseTimestampId("evt", {
  now: () => new Date("2026-01-01T00:00:00Z").getTime(),
  rng: (target) => {}, // leave target as zero-filled
});

events.generate(); // deterministic output
```

The injection contract is the same as the Timestamp codec — `rng` writes random
bytes into the provided target (a 10-byte view into the codec's persistent
buffer). The **default** differs: the Timestamp codec uses a `crypto.randomUUID`
fast-path; the Reverse Timestamp codec uses `crypto.getRandomValues` directly.

## Inversion is reversible by anyone

The bitwise inversion (`~ts & 0xFFFFFFFFFFFF`) is a key-free, deterministic
transform. Creation time is **always recoverable** from the wire form by anyone —
`extractTimestamp` just inverts the bytes back. Like the Timestamp codec, the
Reverse Timestamp codec is **not** a tool for hiding creation time. If you need
the timestamp to be confidential, use the
[Opaque Timestamp codec](/codecs/opaque/) instead.
