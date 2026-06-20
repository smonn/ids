# @smonn/ids

Public-facing branded IDs for TypeScript apps.

```bash
pnpm add @smonn/ids
```

Each ID looks like `usr_01h7b3k9rqxn4cw3p9r8t2sgkz`: a three-letter brand, an underscore, then 26 Crockford base32 characters of payload. The Timestamp codec encodes a 48-bit millisecond Unix timestamp followed by 80 random bits — same byte layout as a [ULID](https://github.com/ulid/spec); see [ADR-0002](./docs/adr/0002-payload-layout.md) for the deliberate divergences. The Opaque Timestamp codec (`@smonn/ids/opaque`) keeps the same wire shape but encrypts the payload under a key, so the timestamp isn't readable from the ID.

## What this is for

### "Give my entities IDs that are safe to expose in URLs, dashboards, and support tickets"

```ts
import { createTimestampId } from "@smonn/ids";

const users = createTimestampId("usr");
const id = users.generate(); // "usr_01h7b3k9rqxn4cw3p9r8t2sgkz"
```

The three-letter brand tells you what kind of thing the ID refers to without an out-of-band lookup. No leaking row counts via sequential PKs, no slug collisions, no "is this a user or an org?" ambiguity in a stack trace.

### "Catch me passing a `UserId` where I needed an `OrgId`"

```ts
import { type Id, createTimestampId } from "@smonn/ids";

const users = createTimestampId("usr");
const orgs = createTimestampId("org");

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
const users = createTimestampId("usr", {
  now: () => new Date("2026-01-01T00:00:00Z").getTime(),
  rng: (target) => {}, // leave target as zero-filled
});

users.generate(); // deterministic snapshot-friendly output
```

Both injection fields (`now?` and `rng?`) are optional. Defaults are `Date.now` and an entropy harvester built on `crypto.randomUUID` (faster than `crypto.getRandomValues` for the 10-byte fills this library needs). `now` returns milliseconds since the Unix epoch. `rng` writes random bytes into the provided target (a 10-byte view into the codec's persistent buffer), so a custom RNG never has to allocate.

### "Catch a double-registered brand before it bites in production"

The intended pattern is one codec per brand per process, constructed at module init. Calling `createTimestampId(brand)` a second time for the same brand usually means a bundling or import bug (accidental re-export, a test re-importing without resetting). In development (`process.env.NODE_ENV !== "production"`), the second call emits a one-shot `console.warn`; the brand-tracking registry is skipped in production. The same registry covers cross-codec collisions: `createTimestampId("usr")` followed by `createOpaqueTimestampId("usr")` warns too, because codec choice is a per-brand commitment ([ADR-0007](./docs/adr/0007-wire-indistinguishable-codec-variants.md)). Tests that intentionally re-create codecs can opt out:

```ts
const users = createTimestampId("usr", { allowDuplicateBrand: true });
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

### "Validate a route param in Hono"

`@smonn/ids/hono` provides `idParam` — a middleware factory that validates a named route param against a codec and exposes the canonical `Id<Brand>` to the handler. Hono is an **optional peer dependency**; install it separately alongside `@smonn/ids`.

```bash
pnpm add hono
```

```ts
import { idParam } from "@smonn/ids/hono";
import { createTimestampId } from "@smonn/ids";

const usr = createTimestampId("usr");

// Default: throws HTTPException → app.onError handles rendering (HTML, JSON, problem+json, …)
app.get("/users/:id", idParam("id", usr), (c) => {
  const id = c.get("id"); // Id<"usr">, canonical
  // …
});

// Override: consumer fully owns the error response
app.get(
  "/orgs/:id",
  idParam("id", org, {
    onError: (failure, c) => c.json({ error: failure.reason }, failure.status),
  }),
  handler,
);

// Or a lightweight status remap without a full handler
app.get("/things/:id", idParam("id", thing, { status: { brand_mismatch: 400 } }), handler);
```

**Default error-channel behavior:** on failure the adapter throws `HTTPException(status)` — it does **not** write a response body itself. This lets the app's existing `app.onError` handler control content negotiation (HTML, JSON, problem+json, redirect, etc.) exactly as it would for any other error.

**`options.onError`:** when provided, the hook owns the response entirely — the adapter neither throws nor writes anything.

**`options.status`:** remaps the default HTTP status for a failure reason without requiring a full handler.

**400 vs 404 defaults:**

- **Brand mismatch (`invalid_prefix`) → `reason: "brand_mismatch"`, status 404.** The resource cannot exist under this route — a `usr_` ID makes no sense on `/orders/:id`.
- **Malformed or missing ID (`invalid_base32` or `not_string`) → `reason: "malformed"`, status 400.** The ID is absent or unreadable — a bad request, not a missing resource.

`idParam` calls `safeParse` at the boundary (lenient: accepts mixed case and Crockford aliases), so the handler always receives a canonical, normalized `Id<Brand>` — never the raw URL string. Works with any codec variant's structural `safeParse`.

### "Validate a route param in Express"

`@smonn/ids/express` provides the same `idParam` factory for Express. Express is an **optional peer dependency**; install it separately alongside `@smonn/ids`.

```bash
pnpm add express
```

```ts
import { idParam, IdParamError } from "@smonn/ids/express";
import { createTimestampId } from "@smonn/ids";

const usr = createTimestampId("usr");

// Default: calls next(err) with an IdParamError → app error-handling middleware renders it
app.get("/users/:id", idParam("id", usr), (req, res) => {
  const id = res.locals.id; // Id<"usr">, canonical
  // …
});

// Error-handling middleware receives the typed error
app.use((err, req, res, next) => {
  if (err instanceof IdParamError) {
    res.status(err.status).json({ error: err.reason });
    return;
  }
  next(err);
});

// Override: consumer fully owns the error response
app.get(
  "/orgs/:id",
  idParam("id", org, {
    onError: (failure, req, res) => res.status(failure.status).json({ error: failure.reason }),
  }),
  handler,
);

// Or a lightweight status remap without a full handler
app.get("/things/:id", idParam("id", thing, { status: { brand_mismatch: 400 } }), handler);
```

**Default error-channel behavior:** on failure the adapter calls `next(err)` with an `IdParamError` carrying `status` and `reason` — it does **not** write a response body itself. This lets the app's existing error-handling middleware control rendering exactly as it would for any other error.

**`options.onError`:** when provided, the hook owns the response entirely — the adapter does not call `next(err)`.

**`options.status`:** remaps the default HTTP status for a failure reason without requiring a full handler.

The 400 vs 404 defaults are identical to the Hono adapter: `reason: "brand_mismatch"` → 404, `reason: "malformed"` → 400. The canonical `Id<Brand>` is stored in `res.locals` under `paramName` and available to downstream handlers.

### "Don't leak creation time in IDs that customers can see"

The Timestamp codec exposes the creation timestamp by design — that's what makes `ORDER BY id` work. If that's a leak you can't accept (invoice IDs revealing billing cadence, signup IDs revealing acquisition velocity), use the Opaque Timestamp codec at `@smonn/ids/opaque`. Same `<brand>_<26 chars>` wire shape, but the payload is AES-encrypted under a key you supply.

```ts
import { createOpaqueTimestampId, importOpaqueKey } from "@smonn/ids/opaque";

const key = await importOpaqueKey(new Uint8Array(16)); // returns an OpaqueKey handle
const invoices = createOpaqueTimestampId("inv", { key });

const id = await invoices.generate(); // "inv_…", timestamp not extractable without the key
await invoices.extractTimestamp(id); // Date — same codec, same key required
```

Three differences from the Timestamp codec:

- **Async key-dependent methods.** WebCrypto is async-only, so `generate`, `generateAt`, and `extractTimestamp` return `Promise`s. `is`, `parse`, `safeParse`, `toJsonSchema`, and the Standard Schema adapter stay sync — they work on the wire form only ([ADR-0006](./docs/adr/0006-async-keyed-codec-contract.md)).
- **No `minIdForTime` / `maxIdForTime`.** Encrypted payloads don't sort by time. If you need time-range scans on entities using the Opaque Timestamp codec, store the timestamp in a separate column.
- **Wire-indistinguishable from the Timestamp codec.** Codec choice is a per-brand commitment; the brand registry warns if you register the same brand against both in dev ([ADR-0007](./docs/adr/0007-wire-indistinguishable-codec-variants.md)).

Encryption is AES-CBC with a zero IV. That's deliberately safe here because the plaintext already carries 80 bits of entropy per ID; see [ADR-0004](./docs/adr/0004-aes-cbc-strip-trick.md) for the full rationale.

To store or transport key material outside the library, `encodeOpaqueKey` / `decodeOpaqueKey` round-trip raw bytes in `hex` or `base64url` — distinct from the Crockford base32 used in ID payloads. The CLI's `keygen` subcommand emits keys in this format (see [CLI](#cli)).

## What this is **not** for

- **Internal surrogate primary keys.** If nobody outside your service ever sees the ID, the brand prefix and lenient parsing are dead weight. Use a `bigint` sequence.
- **Wire-compatible ULIDs.** The byte layout is ULID-shaped but the encoding is lowercase and wrapped in a brand envelope. Stock ULID parsers will reject these.
- **Distributed-trace / request-correlation IDs.** Use OpenTelemetry-format IDs.
- **Hiding creation time with the Timestamp codec.** Anyone with one ID at a known creation time can compute the epoch offset. A custom epoch wouldn't help and isn't supported. To hide creation time per-ID, use the Opaque Timestamp codec (above).

## API surface

```ts
import {
  createTimestampId, // (brand: string, opts?: TimestampOptions) => TimestampCodec<Brand>
  type Id, // branded string type
  type TimestampCodec, // returned by createTimestampId
  type TimestampOptions, // { now?, rng?, allowDuplicateBrand? } constructor options
  type ParseError, // "not_string" | "invalid_prefix" | "invalid_base32"
  type ParseResult, // safeParse return type
  type JsonSchema, // toJsonSchema return type
} from "@smonn/ids";

import {
  createOpaqueTimestampId, // (brand: string, opts: OpaqueTimestampOptions) => OpaqueTimestampCodec<Brand>
  importOpaqueKey, // (bytes: Uint8Array) => Promise<OpaqueKey>
  encodeOpaqueKey, // (bytes: Uint8Array, format: OpaqueKeyFormat) => string
  decodeOpaqueKey, // (encoded: string, format: OpaqueKeyFormat) => Uint8Array
  type OpaqueTimestampCodec, // returned by createOpaqueTimestampId
  type OpaqueTimestampOptions, // { key: OpaqueKey, now?, rng?, allowDuplicateBrand? } constructor options
  type OpaqueKey, // opaque imported handle for AES key material
  type OpaqueKeyFormat, // "hex" | "base64url"
} from "@smonn/ids/opaque";

import {
  createWrappedKeyId, // (brand: string, opts: { kind: "u32" | "i32" | "u64" | "i64", keys }) => WrappedKeyCodec<Brand, Kind>
  importWrappingKey, // (bytes: Uint8Array) => Promise<WrappingKey>
  encodeWrappingKey, // (bytes: Uint8Array, format: WrappingKeyFormat) => string
  decodeWrappingKey, // (encoded: string, format: WrappingKeyFormat) => Uint8Array
  type WrappedKeyCodec, // returned by createWrappedKeyId
  type WrappingKey, // opaque imported handle for wrapping key material
  type WrappingKeyFormat, // "hex" | "base64url"
} from "@smonn/ids/wrapped";

import {
  idColumn, // (codec: IdColumnCodec<Brand>) => PgCustomColumnBuilder (Drizzle column)
  type IdColumnCodec, // { safeParse(value: unknown): ParseResult<Brand> }
} from "@smonn/ids/drizzle";

import {
  idParam, // (paramName: string, codec, options?) => Hono MiddlewareHandler — throws HTTPException by default; onError/status options override
  type IdParamFailure, // { reason: "brand_mismatch" | "malformed"; status: number }
  type IdParamOptions, // { onError?, status? }
} from "@smonn/ids/hono";

import {
  idParam, // (paramName: string, codec, options?) => Express middleware — calls next(err) with IdParamError by default; onError/status options override
  IdParamError, // Error subclass with .reason and .status — forwarded via next(err) by default
  type IdParamFailure, // { reason: "brand_mismatch" | "malformed"; status: number }
  type IdParamOptions, // { onError?, status? }
} from "@smonn/ids/express";
```

`@smonn/ids/wrapped` ships the Wrapped key codec for `u32`, `i32`, `u64`, and `i64` lookup keys. `wrap(lookupKey)` returns a public ID; `unwrap(id)` verifies the payload and returns the lookup key; `safeUnwrap(input)` is the non-throwing path for untrusted input.

**Integer kinds and value types.** The 32-bit kinds (`u32`, `i32`) use safe JavaScript `number` values in their fixed-width ranges. The 64-bit kinds (`u64`, `i64`) always use `bigint` — even when the magnitude would fit in a `number` — to prevent silent truncation or sign erasure.

```ts
import { createWrappedKeyId, importWrappingKey } from "@smonn/ids/wrapped";

const key = await importWrappingKey(new Uint8Array(32));

// u32: number, range [0, 4294967295]
const u32Ids = createWrappedKeyId("inv", { kind: "u32", keys: [key] });
const u32Id = await u32Ids.wrap(42); // number → Id<"inv">
const u32Key = await u32Ids.unwrap(u32Id); // → 42 (number)

// i32: number, range [-2147483648, 2147483647]
const i32Ids = createWrappedKeyId("rec", { kind: "i32", keys: [key] });
const i32Id = await i32Ids.wrap(-7); // number → Id<"rec">
const i32Key = await i32Ids.unwrap(i32Id); // → -7 (number)

// u64: bigint, range [0n, 18446744073709551615n]
const u64Ids = createWrappedKeyId("ord", { kind: "u64", keys: [key] });
const u64Id = await u64Ids.wrap(42n); // bigint → Id<"ord">
const u64Key = await u64Ids.unwrap(u64Id); // → 42n (bigint)

// i64: bigint, range [-9223372036854775808n, 9223372036854775807n]
const i64Ids = createWrappedKeyId("evt", { kind: "i64", keys: [key] });
const i64Id = await i64Ids.wrap(-1n); // bigint → Id<"evt">
const i64Key = await i64Ids.unwrap(i64Id); // → -1n (bigint)
```

**Keyring rotation.** Pass a non-empty ordered list of wrapping keys at construction. The first entry is the _current_ key — the only one `wrap` uses. `unwrap` trials every entry in order until the verification tag matches, so IDs wrapped under any listed key are still unwrappable. Removing an entry from the list revokes all IDs wrapped under it.

```ts
const oldKey = await importWrappingKey(rawOldSecret);
const newKey = await importWrappingKey(rawNewSecret);

// Before rotation: only oldKey in the ring
const legacy = createWrappedKeyId("inv", { kind: "u32", keys: [oldKey] });
const id = await legacy.wrap(7);

// After rotation: newKey is current; oldKey is still accepted on unwrap
const rotated = createWrappedKeyId("inv", { kind: "u32", keys: [newKey, oldKey] });
await rotated.unwrap(id); // succeeds — tried oldKey and matched
await rotated.wrap(7); // uses newKey → different public ID
```

**Equality leakage.** The Wrapped key codec is deterministic: the same lookup key wrapped under the same wrapping key always yields the same public ID. An observer without operator material can tell that two identical public IDs wrap the same lookup key, but cannot recover the lookup key or wrapping key from the ID alone. This is an accepted trade-off for fitting an 8-byte integer lane and an 8-byte verification tag into the 16-byte payload. UUID-sized values (128 bits) are out of scope for this compact branch — there is no room for them alongside the verification tag.

**Fail-closed verification.** `is`, `parse`, and `safeParse` are structural — they check only the prefix and base32 payload shape, with no key material required. Cryptographic verification only happens in `unwrap` and `safeUnwrap`.

- `unwrap(id)` takes a trusted `Id<Brand>` and **throws** if payload verification fails. Use it when the ID is already known to be structurally valid (e.g. freshly loaded from your database).
- `safeUnwrap(input)` accepts untrusted input, structurally parses first, then verifies — without throwing. It returns one of:

```ts
// Success
{
  ok: true;
  id: Id<Brand>;
  lookupKey: number | bigint;
}

// Structural parse failure (wrong brand, invalid base32, etc.)
{
  ok: false;
  error: "not_string" | "invalid_prefix" | "invalid_base32";
}

// Payload verified but tag mismatch (tampered, wrong keyring, or revoked key)
{
  ok: false;
  error: "verification_failed";
}
```

Use `safeUnwrap` at API boundaries where the input is untrusted:

```ts
const result = await invoices.safeUnwrap(req.body.invoiceId);

if (!result.ok) {
  if (result.error === "verification_failed") return 403; // tampered or wrong key
  return 400; // malformed ID
}

const { id, lookupKey } = result; // Id<"inv">, number
```

### Codec methods

| Method                 | `TimestampCodec<Brand>` | `OpaqueTimestampCodec<Brand>` | `WrappedKeyCodec<Brand, Kind>` | Description                                                                   |
| ---------------------- | ----------------------- | ----------------------------- | ------------------------------ | ----------------------------------------------------------------------------- |
| `generate()`           | sync                    | async                         | —                              | Produce a fresh ID                                                            |
| `generateAt(date)`     | sync                    | async                         | —                              | Produce a fresh ID with timestamp bytes from `date` (for backfills)           |
| `wrap(lookupKey)`      | —                       | —                             | async                          | Wrap a lookup key into a public ID using the current wrapping key             |
| `unwrap(id)`           | —                       | —                             | async                          | Verify and recover the lookup key; throws on verification failure             |
| `safeUnwrap(input)`    | —                       | —                             | async                          | Non-throwing: structurally parse then verify; returns parse or verify error   |
| `is(value)`            | sync                    | sync                          | sync                           | Strict type guard: `true` only for already-canonical strings                  |
| `parse(value)`         | sync                    | sync                          | sync                           | Lenient: normalise to canonical, or throw                                     |
| `safeParse(value)`     | sync                    | sync                          | sync                           | Lenient: normalise to canonical, or return `{ ok: false, error }`             |
| `extractTimestamp(id)` | sync                    | async                         | —                              | Decode the creation `Date` from an `Id<Brand>` (trusts the type)              |
| `minIdForTime(date)`   | sync                    | —                             | —                              | Tight lower bound for any ID generated at `date` (for range queries)          |
| `maxIdForTime(date)`   | sync                    | —                             | —                              | Tight upper bound for any ID generated at `date` (for range queries)          |
| `toJsonSchema()`       | sync                    | sync                          | sync                           | JSON Schema (`type`/`pattern`/`description`/`example`) for the canonical form |

## ORM adapters

### Drizzle (`@smonn/ids/drizzle`)

`@smonn/ids/drizzle` is a subpath export that provides a Drizzle custom column type bound to a codec. It requires `drizzle-orm` as a peer dependency — installing `@smonn/ids` alone does not require Drizzle.

```bash
pnpm add drizzle-orm
```

```ts
import { pgTable } from "drizzle-orm/pg-core";
import { idColumn } from "@smonn/ids/drizzle";
import { createTimestampId } from "@smonn/ids";

const usr = createTimestampId("usr");

export const users = pgTable("users", {
  id: idColumn(usr).primaryKey(),
});
// users.id is typed as Id<"usr"> end-to-end
```

`idColumn(codec)` works with any codec variant — `TimestampCodec`, `OpaqueTimestampCodec`, and `WrappedKeyCodec` all satisfy the required interface.

**Write path:** `Id<Brand>` is already canonical, so it is passed to the driver unchanged.

**Read path:** values from the database are normalised via `codec.safeParse()` rather than the strict `is()` check. Data at rest should already be canonical per [ADR-0003](./docs/adr/0003-canonical-strict-is.md), but `safeParse` is a safe boundary in case stale non-canonical values exist. An unrecognised value throws at read time so corrupt data surfaces immediately rather than silently.

```ts
import {
  idColumn, // (codec: IdColumnCodec<Brand>) => PgCustomColumnBuilder
  type IdColumnCodec, // { safeParse(value: unknown): ParseResult<Brand> }
} from "@smonn/ids/drizzle";
```

### Kysely (`@smonn/ids/kysely`)

`@smonn/ids/kysely` is a subpath export that provides a Kysely column adapter bound to a codec. It requires `kysely` as a peer dependency — installing `@smonn/ids` alone does not require Kysely.

```bash
pnpm add kysely
```

```ts
import { idColumn, type IdColumnType } from "@smonn/ids/kysely";
import { createTimestampId } from "@smonn/ids";
import type { Generated } from "kysely";

const usr = createTimestampId("usr");
const usrCol = idColumn(usr);

// Use IdColumnType in your Database interface:
interface Database {
  users: { id: IdColumnType<"usr"> };
}

// Apply runtime transformation in query handlers:
const row = await db.selectFrom("users").selectAll().executeTakeFirstOrThrow();
const id = usrCol.fromDriver(row.id as unknown as string);
```

`idColumn(codec)` works with any codec variant — `TimestampCodec`, `OpaqueTimestampCodec`, and `WrappedKeyCodec` all satisfy the required interface.

**Write path:** `Id<Brand>` is already canonical, so `toDriver` passes it to the driver unchanged.

**Read path:** `fromDriver` normalises the raw DB string via `codec.safeParse()`. An unrecognised value throws at read time so corrupt data surfaces immediately rather than silently.

```ts
import {
  idColumn, // (codec: IdColumnCodec<Brand>) => { toDriver, fromDriver }
  type IdColumnCodec, // { safeParse(value: unknown): ParseResult<Brand> }
  type IdColumnType, // ColumnType<Id<Brand>, Id<Brand>, Id<Brand>>
} from "@smonn/ids/kysely";
```

## CLI

Brand-agnostic subcommands, no install required. Run `npx @smonn/ids --help` for the full flag list.

### `inspect` (`i`)

Decode an ID and print brand, timestamp, canonical form, and whether the input was already canonical.

```bash
$ npx @smonn/ids inspect usr_01h7b3k9rqxn1cw3p9r8t2sgkz
brand:     usr
timestamp: 1983-05-27T10:24:22.469Z (43 years ago)
canonical: usr_01h7b3k9rqxn1cw3p9r8t2sgkz
input:     canonical
```

Accepts non-canonical input (uppercase, Crockford aliases). Assumes the **Timestamp codec** — if the brand uses the **Opaque Timestamp codec**, pass `--opaque` and set `IDS_KEY` (below); otherwise the timestamp line is meaningless garbage.

```bash
IDS_KEY=<hex-or-base64url-key> npx @smonn/ids inspect inv_… --opaque
```

Prints the decrypted timestamp **assuming `IDS_KEY` matches the key used at generation** — a well-formed but wrong key yields a plausible but incorrect timestamp, not an error (see [CONTEXT.md](./CONTEXT.md)).

### `generate` (`g`)

Mint one or more canonical IDs for a brand. Output is one ID per line (pipeable).

```bash
$ npx @smonn/ids generate usr --count 3
usr_…
usr_…
usr_…
```

Flags: `--count` / `-c N` (default 1, max 10000). Uses the Timestamp codec unless `--opaque` is set.

```bash
IDS_KEY=<hex-or-base64url-key> npx @smonn/ids generate inv --opaque --count 2
```

### `keygen` (`k`)

Emit a random Opaque key to stdout (a secret — do not log or commit). Default: 256-bit hex.

```bash
$ npx @smonn/ids keygen
a1b2c3…

$ npx @smonn/ids keygen --bits 128 --key-format base64url
AbCdEf…
```

Flags: `--bits 128|192|256` (default 256), `--key-format hex|base64url` (default `hex`). `IDS_KEY_FORMAT` does not affect `keygen` — only `--key-format` on the command line. Output round-trips through `decodeOpaqueKey` / `importOpaqueKey`.

### Opaque mode (`--opaque`)

`generate --opaque` and `inspect --opaque` read the AES key from the `IDS_KEY` environment variable — not from argv (argv leaks via `ps` and shell history). Missing or malformed `IDS_KEY` prints a clear stderr message and exits non-zero.

Key format defaults to `hex`; override per-invocation with `--key-format` or set `IDS_KEY_FORMAT=hex|base64url` for a session default. `--key-format` on the command line wins over `IDS_KEY_FORMAT`.

Invalid input prints the parse error to stderr and exits non-zero.

## Design

- [`CONTEXT.md`](./CONTEXT.md) — glossary of the project's vocabulary
- [`docs/adr/`](./docs/adr/) — recorded design decisions
