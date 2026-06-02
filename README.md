# @smonn/ids

Public-facing branded IDs for TypeScript apps.

```bash
pnpm add @smonn/ids
```

Each ID looks like `usr_01h7b3k9rqxn4cw3p9r8t2sgkz`: a three-letter brand, an underscore, then 26 Crockford base32 characters encoding a 48-bit millisecond Unix timestamp followed by 80 random bits. Same byte layout as a [ULID](https://github.com/ulid/spec); see [ADR-0002](./docs/adr/0002-payload-layout.md) for the deliberate divergences.

## What this is for

### "Give my entities IDs that are safe to expose in URLs, dashboards, and support tickets"

```ts
import { createId } from "@smonn/ids";

const users = createId("usr");
const id = users.generate(); // "usr_01h7b3k9rqxn4cw3p9r8t2sgkz"
```

The three-letter brand tells you what kind of thing the ID refers to without an out-of-band lookup. No leaking row counts via sequential PKs, no slug collisions, no "is this a user or an org?" ambiguity in a stack trace.

### "Catch me passing a `UserId` where I needed an `OrgId`"

```ts
import { type Id, createId } from "@smonn/ids";

const users = createId("usr");
const orgs = createId("org");

function loadUser(id: Id<"usr">) {
  /* ... */
}

loadUser(orgs.generate()); // ❌ Type 'Id<"org">' is not assignable to 'Id<"usr">'.
```

`Id<Brand>` is nominally tagged. `Id<"usr">` and `Id<"org">` are not interchangeable — even though both are strings at runtime, the type system treats them as distinct.

### "A support agent emailed me an ID — accept it even if they typed it wrong"

```ts
users.safeParse("usr_01h7b3k9rqxn1cw3p9r8t2sgkz"); // canonical
users.safeParse("USR_01H7B3K9RQXN1CW3P9R8T2SGKZ"); // uppercase
users.safeParse("usr_Olh7b3k9rqxnIcw3p9r8t2sgkz"); // o, I, l aliased
// → { ok: true, id: "usr_01h7b3k9rqxn1cw3p9r8t2sgkz" } for all three
```

`safeParse` accepts mixed case and the Crockford-spec visual aliases (`o → 0`, `i → 1`, `l → 1`), and always returns the **canonical form** — lowercase, aliases resolved. Equality checks on canonical strings work as expected.

### "Validate an ID arriving from a URL or request body"

```ts
const r = users.safeParse(input);

if (!r.ok) {
  switch (r.error) {
    case "not_string":
      return 400; // wasn't a string at all
    case "invalid_prefix":
      return 404; // wrong kind of ID (or not an ID)
    case "invalid_base32":
      return 400; // prefix matched but payload is malformed
  }
}

const userId = r.id; // Id<"usr">, canonical
```

`ParseError` is exported as a literal union so the switch is exhaustive at compile time.

### "Sort and date-stamp records using just the ID"

The first 6 bytes of the payload are a big-endian millisecond Unix timestamp, so `ORDER BY id` sorts by creation time without a separate `created_at` column. To extract the timestamp from an existing ID:

```ts
users.extractTimestamp(id); // Date
```

For time-range queries, `minIdForTime(date)` and `maxIdForTime(date)` build synthetic IDs at the tight lower and upper bounds of a given millisecond — same timestamp bytes, random portion filled with all `0x00` (min) or all `0xFF` (max). No separate `created_at` column needed:

```ts
const start = new Date("2026-01-01T00:00:00Z");
const end = new Date("2026-02-01T00:00:00Z");

sql`SELECT * FROM users WHERE id BETWEEN ${users.minIdForTime(start)} AND ${users.maxIdForTime(end)}`;
```

Both validate the date the same way `generate()` does — pre-epoch or past the 48-bit ceiling throws.

The timestamp layout (millisecond precision, big-endian, Unix epoch) is part of the public contract — see [ADR-0002](./docs/adr/0002-payload-layout.md).

Caveat: two IDs generated in the same millisecond by the same process have independent random tails and do **not** sort deterministically relative to each other. If you need stable intra-millisecond ordering, this library isn't the right tool.

### "Inject a fixed clock and RNG so my tests are deterministic"

```ts
const users = createId("usr", {
  now: () => new Date("2026-01-01T00:00:00Z").getTime(),
  rng: (target) => {}, // leave target as zero-filled
});

users.generate(); // deterministic snapshot-friendly output
```

Both `Options` fields are optional. Defaults are `Date.now` and an entropy harvester built on `crypto.randomUUID` (faster than `crypto.getRandomValues` for the 10-byte fills this library needs). `now` returns milliseconds since the Unix epoch. `rng` writes random bytes into the provided target (a 10-byte view into the codec's persistent buffer), so a custom RNG never has to allocate.

## What this is **not** for

- **Internal surrogate primary keys.** If nobody outside your service ever sees the ID, the brand prefix and lenient parsing are dead weight. Use a `bigint` sequence.
- **Wire-compatible ULIDs.** The byte layout is ULID-shaped but the encoding is lowercase and wrapped in a brand envelope. Stock ULID parsers will reject these.
- **Distributed-trace / request-correlation IDs.** Use OpenTelemetry-format IDs.
- **Hiding when your system launched.** Anyone with one known-time ID can compute the epoch offset. A custom epoch isn't supported, and wouldn't help anyway.

## API surface

```ts
import {
  createId, // (brand: string, opts?: Partial<Options>) => Codec<Brand>
  type Id, // branded string type
  type Codec, // returned by createId
  type Options, // { now, rng } injection points
  type ParseError, // "not_string" | "invalid_prefix" | "invalid_base32"
  type ParseResult, // safeParse return type
} from "@smonn/ids";
```

### `Codec<Brand>`

| Method                 | Description                                                          |
| ---------------------- | -------------------------------------------------------------------- |
| `generate()`           | Produce a fresh ID                                                   |
| `is(value)`            | Strict type guard: `true` only for already-canonical strings         |
| `parse(value)`         | Lenient: normalise to canonical, or throw                            |
| `safeParse(value)`     | Lenient: normalise to canonical, or return `{ ok: false, error }`    |
| `extractTimestamp(id)` | Decode the creation `Date` from an `Id<Brand>` (trusts the type)     |
| `minIdForTime(date)`   | Tight lower bound for any ID generated at `date` (for range queries) |
| `maxIdForTime(date)`   | Tight upper bound for any ID generated at `date` (for range queries) |

## Design

- [`CONTEXT.md`](./CONTEXT.md) — glossary of the project's vocabulary
- [`docs/adr/`](./docs/adr/) — recorded design decisions
