---
title: Timestamp codec
description: The default @smonn/ids codec — plaintext, time-sortable branded IDs with lenient parsing.
---

The Timestamp codec is the default. It encodes a 48-bit millisecond Unix
timestamp followed by 80 random bits — the same byte layout as a
[ULID](https://github.com/ulid/spec), with [deliberate
divergences](https://github.com/smonn/ids/blob/main/docs/adr/0002-payload-layout.md).

```ts
import { createTimestampId } from "@smonn/ids";

const users = createTimestampId("usr");
const id = users.generate(); // "usr_01h7b3k9rqxn4cw3p9r8t2sgkz"
```

Most of the behavior on this page — lenient parsing, error handling, Standard
Schema, JSON Schema, deterministic injection, and the duplicate-brand check — is
**shared by every codec**. The other codec pages only describe what differs.

## Lenient parsing and canonical form

`safeParse` accepts mixed case and the Crockford-spec visual aliases
(`o → 0`, `i → 1`, `l → 1`), and always returns the **canonical form** —
lowercase, aliases resolved. The **26th character** is additionally restricted
to `[048cgmrw]` — the 8 alphabet values whose low 2 bits are zero, satisfying
the 130→128-bit padding constraint for a 16-byte payload. A string whose final
character falls outside that set is rejected as `invalid_base32` by
`safeParse`/`parse`/`is`.

```ts
users.safeParse("usr_01h7b3k9rqxn1cw3p9r8t2sgkz"); // canonical
users.safeParse("USR_01H7B3K9RQXN1CW3P9R8T2SGKZ"); // uppercase
users.safeParse("usr_Olh7b3k9rqxnIcw3p9r8t2sgkz"); // o, I, l aliased
// → { ok: true, id: "usr_01h7b3k9rqxn1cw3p9r8t2sgkz" } for all three
```

Equality checks on canonical strings work as expected. For untrusted input,
branch on the `ParseError` union — it is exhaustive at compile time:

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

`is(value)` is the strict counterpart — `true` only for already-canonical
strings. `parse(value)` is the throwing version of `safeParse`.

## Structured errors

`parse()`, the ORM adapter read paths, and the codec constructors throw
`IdsError` on failure — a single class with a stable `code` field. Use
`isIdsError()` rather than `instanceof`, so it survives multiple copies of the
package loaded in one process (the ESM + CJS dual-package hazard):

```ts
import { isIdsError } from "@smonn/ids";

try {
  users.parse(rawInput);
} catch (err) {
  if (isIdsError(err)) {
    switch (err.code) {
      case "invalid_id": // parse failed; err.cause is the ParseError string
        return 400;
      case "invalid_brand": // bad codec construction — fix the brand string
        throw err;
    }
  }
  throw err;
}
```

`IdsErrorCode` is a stable contract (the `message` is not). `invalid_id`
carries the originating `ParseError` string on `cause`. The full code list is in
the [API reference](/api/index/type-aliases/idserrorcode/).

## Sort and date-stamp using just the ID

The first 6 bytes of the payload are a big-endian millisecond Unix timestamp, so
`ORDER BY id` sorts by creation time without a separate `created_at` column.

```ts
users.extractTimestamp(id); // Date
```

:::note
`extractTimestamp` trusts the branded `Id<Brand>` type — it does no
validation of its own. Pass untrusted strings through `safeParse`/`parse`
first (see [ADR-0002](https://github.com/smonn/ids/blob/main/docs/adr/0002-payload-layout.md)).
:::

For time-range queries, `minIdForTime(date)` and `maxIdForTime(date)` build
synthetic IDs at the tight lower and upper bounds of a given millisecond — same
timestamp bytes, random portion all `0x00` (min) or all `0xFF` (max):

```ts
const start = new Date("2026-01-01T00:00:00Z");
const end = new Date("2026-02-01T00:00:00Z");

sql`SELECT * FROM users WHERE id BETWEEN ${users.minIdForTime(start)} AND ${users.maxIdForTime(end)}`;
```

To mint a real ID at a timestamp you choose rather than at `now`, use
`generateAt(date)` — the one-liner for backfills:

```ts
const id = users.generateAt(new Date("2024-03-15T12:00:00Z")); // Id<"usr">
users.extractTimestamp(id); // → 2024-03-15T12:00:00.000Z

// Migrating from UUIDv7 / ULID / Snowflake:
const ids = oldRows.map((r) => users.generateAt(extractTime(r)));
```

All four validate the date exactly like `generate()`. The following cases throw
a plain `Error` (not `IdsError`): a non-integer timestamp (NaN, Infinity, or a
float), a negative value (pre-epoch), a value past the 48-bit ceiling
(`>= 2^48` ms), or an `Invalid Date`.

:::caution
Two IDs generated in the same millisecond have independent random tails and do
**not** sort deterministically relative to each other. If you need stable
intra-millisecond ordering, this library isn't the right tool.
:::

## Deterministic tests

Inject a fixed clock and RNG for snapshot-friendly output. Both fields are
optional; defaults are `Date.now` and an entropy harvester built on
`crypto.randomUUID`:

```ts
const users = createTimestampId("usr", {
  now: () => new Date("2026-01-01T00:00:00Z").getTime(),
  rng: (target) => {}, // leave target as zero-filled
});

users.generate(); // deterministic output
```

`rng` writes random bytes into the provided target (a 10-byte view into the
codec's persistent buffer), so a custom RNG never allocates.

## Catch a double-registered brand

The intended pattern is one codec per brand per process, constructed at module
init. In development (`NODE_ENV !== "production"`), constructing a second codec
for the same brand emits a one-shot `console.warn` — it usually means a bundling
or import bug. Opt out where re-creating is intentional:

```ts
const users = createTimestampId("usr", { allowDuplicateBrand: true });
```

The check is a heuristic: two physical copies of the package each keep their own
registry, so it catches re-imports of one module copy, not duplicate copies of
the module itself.

## Standard Schema

Each codec implements [Standard Schema v1](https://standardschema.dev/), so it
slots into any validator-aware library (Zod, Valibot, ArkType, tRPC, Hono)
without rewriting `z.string().refine(usr.is)` boilerplate:

```ts
import { type } from "arktype";

const Body = type({ userId: users });

const r = Body({ userId: "USR_01H7B3K9RQXN1CW3P9R8T2SGKZ" });
// → { userId: "usr_01h7b3k9rqxn1cw3p9r8t2sgkz" } typed as Id<"usr">
```

`validate` is synchronous, wraps `safeParse`, and returns the canonical
`Id<Brand>` on success. Each `ParseError` maps to a distinct message
(`expected string`, `expected prefix 'usr_'`, `invalid base32 payload`).

## JSON Schema

```ts
users.toJsonSchema();
// {
//   type: "string",
//   pattern: "^usr_[0-9a-hjkmnp-tv-z]{25}[048cgmrw]$",
//   description: "Branded ID for 'usr'",
//   example: "usr_01h7b3k9rqxn1cw3p9r8t2sgkz",
// }
```

Drop the result straight into an OpenAPI `components.schemas` entry. The
`pattern` describes the **canonical form only** — it matches `generate()` output
and `is()`, but rejects the uppercase and aliases that `safeParse()` tolerates
(see [ADR-0003](https://github.com/smonn/ids/blob/main/docs/adr/0003-canonical-strict-is.md)).
`example` is freshly generated on each call, so it always matches the `pattern`.

## Not for hiding creation time

The Timestamp codec exposes the creation time by design — that's what makes
`ORDER BY id` work. Anyone with one ID at a known creation time can compute the
epoch offset; a custom epoch wouldn't help and isn't supported. To hide creation
time per-ID, use the [Opaque Timestamp codec](/codecs/opaque/).
