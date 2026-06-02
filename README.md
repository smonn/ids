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

To mint a real ID (random tail and all) at a timestamp you choose rather than at `now`, use `generateAt(date)`. The timestamp bytes come from the supplied `Date`; the random portion is filled by the codec's `rng`, so the result round-trips through `extractTimestamp` exactly:

```ts
const id = users.generateAt(new Date("2024-03-15T12:00:00Z")); // Id<"usr">
users.extractTimestamp(id); // → 2024-03-15T12:00:00.000Z
```

This is the one-liner for backfilling: migrating from UUIDv7 / ULID / Snowflake is `oldRows.map((r) => users.generateAt(extractTime(r)))`, with no need to spin up a throwaway codec per timestamp. It validates the date exactly like `generate()` — pre-epoch, past the 48-bit ceiling, or an `Invalid Date` throws.

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

### "Catch a double-registered brand before it bites in production"

The intended pattern is one codec per brand per process, constructed at module init. Calling `createId(brand)` a second time for the same brand usually means a bundling or import bug (accidental re-export, a test re-importing without resetting). In development (`process.env.NODE_ENV !== "production"`), the second call emits a one-shot `console.warn`; the brand-tracking registry is skipped in production. Tests that intentionally re-create codecs can opt out:

```ts
const users = createId("usr", { allowDuplicateBrand: true });
```

The check is a heuristic, not a guarantee. Two physical copies of `@smonn/ids` loaded into the same process (the worst-case bundling bug) each keep their own registry, so neither warns — it catches re-imports of a single module copy, not duplicate copies of the module itself.

### "Use with any Standard Schema validator"

Each codec implements [Standard Schema v1](https://standardschema.dev/), so it slots directly into any validator-aware library (Zod, Valibot, ArkType, tRPC inputs, Hono, etc.) without rewriting the same `z.string().refine(usr.is)` boilerplate:

```ts
import { type } from "arktype";

const Body = type({ userId: users });

const r = Body({ userId: "USR_01H7B3K9RQXN1CW3P9R8T2SGKZ" });
// → { userId: "usr_01h7b3k9rqxn1cw3p9r8t2sgkz" } typed as Id<"usr">
```

`validate` is synchronous, wraps `safeParse`, and returns the canonical `Id<Brand>` on success. Each `ParseError` variant maps to a distinct `issues[].message`:

| ParseError       | message                  |
| ---------------- | ------------------------ |
| `not_string`     | `expected string`        |
| `invalid_prefix` | `expected prefix 'usr_'` |
| `invalid_base32` | `invalid base32 payload` |

### "Describe an ID field in an OpenAPI / JSON Schema spec"

```ts
users.toJsonSchema();
// {
//   type: "string",
//   pattern: "^usr_[0-9a-hjkmnp-tv-z]{26}$",
//   description: "Branded ID for 'usr'",
//   example: "usr_01h7b3k9rqxn1cw3p9r8t2sgkz",
// }
```

`toJsonSchema()` returns a plain object you can drop straight into an OpenAPI `components.schemas` entry, a JSON Schema document, or any tool that derives sample payloads from `example`. The character class `[0-9a-hjkmnp-tv-z]` is the lowercase Crockford base32 alphabet (excludes `i`, `l`, `o`, `u`).

The `pattern` describes the **canonical form only** — it matches `generate()` output and what `is()` accepts, but rejects uppercase and the Crockford aliases (`o`, `i`, `l`) that `safeParse()` tolerates. Normalising lenient input is the codec's job at the boundary; an artefact that describes data at rest describes the canonical wire shape (see [ADR-0003](./docs/adr/0003-canonical-strict-is.md)).

`example` is produced by calling `generate()` on each invocation, so it is fresh (non-deterministic) and always matches the returned `pattern`. One consequence: a codec wired with an injected `now` outside the 48-bit range — the same misconfiguration that breaks `generate()` — makes `toJsonSchema()` throw too.

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
  type Options, // { now, rng, allowDuplicateBrand } injection points
  type ParseError, // "not_string" | "invalid_prefix" | "invalid_base32"
  type ParseResult, // safeParse return type
  type JsonSchema, // toJsonSchema return type
} from "@smonn/ids";
```

### `Codec<Brand>`

| Method                 | Description                                                                   |
| ---------------------- | ----------------------------------------------------------------------------- |
| `generate()`           | Produce a fresh ID                                                            |
| `generateAt(date)`     | Produce a fresh ID with timestamp bytes from `date` (for backfills)           |
| `is(value)`            | Strict type guard: `true` only for already-canonical strings                  |
| `parse(value)`         | Lenient: normalise to canonical, or throw                                     |
| `safeParse(value)`     | Lenient: normalise to canonical, or return `{ ok: false, error }`             |
| `extractTimestamp(id)` | Decode the creation `Date` from an `Id<Brand>` (trusts the type)              |
| `minIdForTime(date)`   | Tight lower bound for any ID generated at `date` (for range queries)          |
| `maxIdForTime(date)`   | Tight upper bound for any ID generated at `date` (for range queries)          |
| `toJsonSchema()`       | JSON Schema (`type`/`pattern`/`description`/`example`) for the canonical form |

## CLI

Two brand-agnostic subcommands, no install required:

```bash
$ npx @smonn/ids inspect usr_01h7b3k9rqxn1cw3p9r8t2sgkz
brand:     usr
timestamp: 1983-05-27T10:24:22.469Z (43 years ago)
canonical: usr_01h7b3k9rqxn1cw3p9r8t2sgkz
input:     canonical

$ npx @smonn/ids generate usr --count 3
usr_…
usr_…
usr_…
```

`inspect` accepts non-canonical input (uppercase, Crockford aliases) and shows the canonical form. `generate` prints one ID per line so output is pipeable. Invalid input prints the parse error to stderr and exits non-zero.

## Design

- [`CONTEXT.md`](./CONTEXT.md) — glossary of the project's vocabulary
- [`docs/adr/`](./docs/adr/) — recorded design decisions
