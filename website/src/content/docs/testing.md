---
title: Testing
description: Make @smonn/ids output deterministic in tests by injecting a fixed clock, RNG, and key — no extra import required.
---

Every codec generates fresh entropy and reads the wall clock, so by default its
output changes on every call — fine in production, awkward in a snapshot test.
You don't need a separate testing package to fix that: the same `now`, `rng`,
and `key` options the codecs already take are the entire testing surface. Inject
fixed values and the output becomes reproducible.

:::note
There is intentionally **no `@smonn/ids/testing` import**. Determinism is a
property of the options you pass at construction, not a separate code path —
anything a test helper could do here, it would do by injecting `now` / `rng` /
fixed key bytes, which you can do directly.
:::

## Keyless codecs — fix the clock and RNG

The [Timestamp](/codecs/timestamp/) and [Reverse Timestamp](/codecs/reverse/)
codecs need only a fixed `now` and a no-op `rng`. Both options are optional and
default to `Date.now` and a `crypto.randomUUID`-backed RNG; override them to pin
the output:

```ts
import { createTimestampId } from "@smonn/ids";

const users = createTimestampId("usr", {
  now: () => new Date("2026-01-01T00:00:00Z").getTime(),
  rng: (target) => {}, // leave target zero-filled
});

users.generate(); // same ID every call
```

`rng` writes random bytes into the provided `target` — a view already sized for
the codec's random tail (10 bytes for Timestamp and Reverse, 5 bytes for
Signed), so a custom RNG never allocates. Leaving `target` untouched yields an
all-zero tail; fill it deterministically if you need distinct-but-stable IDs:

```ts
let counter = 0;
const seq = createTimestampId("usr", {
  now: () => 0,
  rng: (target) => {
    target[target.length - 1] = counter++; // distinct, reproducible tails
  },
});
```

## Keyed codecs — add a fixed key

[Signed](/codecs/signed/), [Opaque](/codecs/opaque/),
[Wrapped](/codecs/wrapped/), and [Digest](/codecs/digest/) derive their keys
from raw bytes via HKDF, so a **fixed byte array gives a fixed key** — and their
key-dependent methods are `async` (WebCrypto). Import a key from constant bytes
and the whole round-trip is reproducible.

:::caution
Zero-filled or hard-coded key bytes are for tests only. Never ship a fixed key
to production — derive real key material from a secret manager.
:::

**Signed and Opaque** carry a random/timestamp payload, so they take the same
`now` / `rng` injection as the keyless codecs, plus a key:

```ts
import { createOpaqueTimestampId, importOpaqueKey } from "@smonn/ids/opaque";

const key = await importOpaqueKey(new Uint8Array(16)); // fixed bytes → fixed key
const invoices = createOpaqueTimestampId("inv", {
  key,
  now: () => new Date("2026-01-01T00:00:00Z").getTime(),
  rng: (target) => {}, // zero-filled payload → deterministic ciphertext
});

const id = await invoices.generate(); // stable across runs
await invoices.extractTimestamp(id); // 2026-01-01T00:00:00Z — same key required
```

The [Signed codec](/codecs/signed/) is identical in shape — pass `keys: [key]`
from `importSigningKey`, then `await codec.generate()` and `await
codec.verify(id)` against the fixed key.

**Wrapped and Digest** are deterministic _by construction_ — they have no `now`
or `rng`. The same input under the same key always produces the same ID, so a
fixed key is all you need:

```ts
import { createDigestId, importDigestKey } from "@smonn/ids/digest";

const key = await importDigestKey(new Uint8Array(32));
const idk = createDigestId("idk", { ns: "checkout", key });

await idk.digest("order-42"); // same material → same ID, every run
```

[Wrapped](/codecs/wrapped/) behaves the same way: `await codec.wrap(42)` round-
trips to `await codec.unwrap(id)` deterministically under a fixed wrapping key.

## Asserting against untrusted input

The parsing methods (`is`, `parse`, `safeParse`, `toJsonSchema`) are synchronous
and need **no key** — they work on the wire form alone. Use them to test how
your boundary handles bad input without standing up any keyed machinery:

```ts
const result = users.safeParse(untrustedString);
expect(result.ok).toBe(false);
```

## Property-based testing

For invariants rather than fixed snapshots, drive a deterministic codec with
generated inputs. Because injection makes generation a pure function of `now` /
`rng` / key, the same seed reproduces the same run — pair it with your
property-testing library of choice (this project uses
[fast-check](https://fast-check.dev/) internally):

```ts
fc.assert(
  fc.property(fc.date({ min: new Date(0) }), (date) => {
    const id = events.generateAt(date);
    expect(events.extractTimestamp(id).getTime()).toBe(date.getTime());
  }),
);
```

## What injection does not change

Determinism is scoped to the codec instance you configured — it does not touch
the process-global brand registry. Constructing two codecs for the same brand in
one test process still triggers the [duplicate-brand
warning](/codecs/timestamp/#catch-a-double-registered-brand); pass
`allowDuplicateBrand: true` on the extra instances when that is intentional (for
example, exercising a key-rotation path in a single test).
