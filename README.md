# @smonn/ids

Public-facing branded IDs for TypeScript apps. Type-safe, sortable, and codec-pluggable.

📖 **Full documentation & interactive playground: [ids.smonn.se](https://ids.smonn.se)**

```bash
pnpm add @smonn/ids
```

Each ID looks like `usr_06f80z92d2dbsqqg28t5cy4tqg`: a three-letter brand, an underscore, then 26 Crockford base32 characters of payload. The default Timestamp codec encodes a 48-bit millisecond Unix timestamp followed by 80 random bits — the same byte layout as a [ULID](https://github.com/ulid/spec).

## Quickstart

```ts
import { type Id, createTimestampId } from "@smonn/ids";

const users = createTimestampId("usr");

// Generate — sortable by creation time via ORDER BY id
const id = users.generate(); // "usr_06f80z92d2dbsqqg28t5cy4tqg"

// Branded: Id<"usr"> and Id<"org"> are not interchangeable
function loadUser(id: Id<"usr">) {
  /* ... */
}

// Validate untrusted input — lenient in, canonical out
const r = users.safeParse("USR_06F80Z92D2DBSQQG28T5CY4TQG");
if (r.ok) {
  r.id; // "usr_06f80z92d2dbsqqg28t5cy4tqg" as Id<"usr">
}
```

`safeParse` accepts mixed case and the Crockford visual aliases (`o → 0`, `i → 1`, `l → 1`) and always returns the canonical lowercase form. See the [Timestamp codec guide](https://ids.smonn.se/codecs/timestamp/) for sorting, backfills (`generateAt`), range queries, structured errors, Standard Schema, and JSON Schema.

## Choosing a codec

All six codecs share the same `<brand>_<26 chars>` wire shape but make different trade-offs. They are wire-indistinguishable — `safeParse`, `is`, and `parse` cannot distinguish an Opaque Timestamp ID from a Timestamp ID at runtime. Cross-codec confusion is undetectable by the library; the consumer is responsible for routing a given ID to the correct codec for the brand. Codec choice is therefore a per-brand commitment.

| Codec | Import | Sort direction | Key required | Timestamp extractable |
| --- | --- | --- | --- | --- |
| Timestamp | `@smonn/ids` | Ascending (oldest-first) | No | Always (plaintext) |
| Reverse Timestamp | `@smonn/ids/reverse` | Descending (newest-first) | No | Always (plaintext) |
| Signed Timestamp | `@smonn/ids/signed` | Ascending (oldest-first) | Yes (signing key) | Always (plaintext) |
| Opaque Timestamp | `@smonn/ids/opaque` | None (encrypted) | Yes (key material) | With key only |
| Wrapped key | `@smonn/ids/wrapped` | None | Yes (wrapping key) | N/A — not timestamp-family |
| Digest | `@smonn/ids/digest` | None | Yes (digest key) | N/A — not timestamp-family |

The Timestamp codec is the default and ships from the root `@smonn/ids` entry — it has no `/timestamp` subpath by design. If you try `import ... from "@smonn/ids/timestamp"` you will get a module-resolution error; use `@smonn/ids` directly. Every other codec uses a named subpath (`/reverse`, `/signed`, `/opaque`, `/wrapped`, `/digest`); this asymmetry is intentional and permanent.

- **Newest-first scans** on forward-only KV stores → [Reverse Timestamp](https://ids.smonn.se/codecs/reverse/)
- **Tamper-evident share links** verified without a DB lookup → [Signed Timestamp](https://ids.smonn.se/codecs/signed/) (integrity)
- **IDs that must not leak creation time** → [Opaque Timestamp](https://ids.smonn.se/codecs/opaque/) (confidentiality)
- **A public handle for an internal integer PK** → [Wrapped key](https://ids.smonn.se/codecs/wrapped/)
- **Idempotency keys, content-addressed records, or stable public pseudonyms** → [Digest](https://ids.smonn.se/codecs/digest/)

Try them all live in the [playground](https://ids.smonn.se/playground/).

## Integrations

Framework and ORM adapters ship as optional subpath exports (each requires its own peer dependency):

- **HTTP params:** [Hono](https://ids.smonn.se/adapters/hono/), [Express](https://ids.smonn.se/adapters/express/), [Fastify](https://ids.smonn.se/adapters/fastify/) — `idParam`, `idQuery` middleware; [NestJS](https://ids.smonn.se/adapters/nestjs/) — `ParseIdPipe`
- **ORM columns:** [Drizzle](https://ids.smonn.se/adapters/drizzle/) — `idColumn`, `idColumnMysql`, `idColumnSqlite`, [Kysely](https://ids.smonn.se/adapters/kysely/) — `idPlugin` / `idColumn`, [MikroORM](https://ids.smonn.se/adapters/mikro-orm/) — `idType`, [Prisma](https://ids.smonn.se/adapters/prisma/) — `idField`, [TypeORM](https://ids.smonn.se/adapters/typeorm/) — `idTransformer`
- **GraphQL:** [GraphQL](https://ids.smonn.se/adapters/graphql/) — `idScalar` custom scalar
- **CLI:** brand-agnostic `inspect` / `generate` / `keygen` — `npx @smonn/ids --help` ([docs](https://ids.smonn.se/cli/))

Every codec also implements [Standard Schema v1](https://standardschema.dev/), so it slots into Zod, Valibot, ArkType, tRPC, and any validator-aware library.

**Native `uuid` column storage:** an `Id<Brand>` can be persisted into a native `uuid` column via `codec.toUUID(id)` and read back as a branded ID via `codec.fromUUID(value)` or `codec.safeFromUUID(value)` — a lossless round-trip useful when migrating off UUID primary keys while keeping existing column types and indexes.

## What this is **not** for

- **Internal surrogate primary keys.** If nobody outside your service sees the ID, the brand prefix and lenient parsing are dead weight. Use a `bigint` sequence.
- **Wire-compatible ULIDs.** The byte layout is ULID-shaped, but the encoding is lowercase and brand-wrapped. Stock ULID parsers will reject these.
- **Spec-valid UUIDv7 output.** `toUUID` produces a **raw, unversioned** UUID — all 128 payload bits are preserved verbatim (lossless round-trip), which means the version/variant nibble positions hold real data, not `0x7`/`0b10`. It is **not** a spec-valid UUIDv7. Only the Timestamp codec happens to produce a UUID whose leading 48 bits are a real millisecond timestamp; only Timestamp and Reverse Timestamp produce time-sortable UUIDs. Importing a non-time-ordered UUID (e.g. a UUIDv4) into a timestamp-family codec via `fromUUID` yields a structurally valid `Id<Brand>` with a meaningless timestamp and random sort order — the same wire-indistinguishable contract that already governs codec variants.
- **Distributed-trace / request-correlation IDs.** Use OpenTelemetry-format IDs.
- **Hiding creation time with the Timestamp codec.** Anyone with one ID at a known creation time can compute the epoch offset. Use the Opaque Timestamp codec to hide creation time per-ID.

## API surface

Exports from the main `@smonn/ids` entry point only. Codec-specific subpath exports (`@smonn/ids/reverse`, `@smonn/ids/opaque`, `@smonn/ids/signed`, `@smonn/ids/wrapped`, `@smonn/ids/digest`) and adapter subpaths are not listed here.

### Types

- `Id<Brand>` — Canonical branded ID string for `Brand`; produced by `generate()` and `safeParse()`.
- `ParseError` — Parse failure reason string returned by `safeParse()` (`"not_string"`, `"invalid_prefix"`, or `"invalid_base32"`) and by `safeFromUUID()` (`"not_string"` or `"invalid_uuid"`).
- `ParseResult<Brand>` — Discriminated union returned by `safeParse()`: `{ ok: true; id: Id<Brand> }` or `{ ok: false; error: ParseError }`.
- `JsonSchema` — Shape of the object returned by a codec's `toJsonSchema()`.
- `IdsErrorCode` — String-literal union of the eleven stable error codes carried by `IdsError`.
- `TimestampCodec<Brand>` — Interface of a brand-scoped Timestamp codec instance returned by `createTimestampId()`.
- `TimestampOptions` — Construction options for `createTimestampId()`: `now`, `rng`, and `allowDuplicateBrand`.
- `ValidBrand<S>` — Compile-time validation that `S` is a well-formed brand (three lowercase `a–z` characters); intersect it with a codec constructor's brand parameter (`brand: Brand & ValidBrand<Brand>`) to reject malformed brands at the type level.

### Classes

- `IdsError` — Single error class thrown by caller-reachable failures; carries a stable `code: IdsErrorCode`. Use `isIdsError()` rather than `instanceof` to detect across realms.

### Functions

- `isIdsError(value)` — Type guard for `IdsError`; uses an internal brand to survive ESM/CJS dual-package duplication where bare `instanceof` fails.
- `createTimestampId(brand, options?)` — Creates a Timestamp codec for `brand` (three lowercase `a–z` characters).

### Shared codec methods (all variants)

Every codec instance exposes the following UUID interop methods in addition to the codec-specific ones documented on the [full docs site](https://ids.smonn.se):

- `toUUID(id)` — Takes a trusted `Id<Brand>`, returns the 16-byte payload reinterpreted as a canonical lowercase-hyphenated UUID `string`. Total — cannot fail. The brand is shed; the output is a plain `string`, not a branded type.
- `fromUUID(value)` — Takes an untrusted `string`, returns `Id<Brand>`. Throws `IdsError` (`code: "invalid_id"`) with a `ParseError` on `cause` (`"invalid_uuid"`, or `"not_string"` for untyped JavaScript callers) on malformed input.
- `safeFromUUID(value)` — Takes `unknown`, returns `ParseResult<Brand>` (`{ ok: true; id }` or `{ ok: false; error: ParseError }`). Never throws.

## Links

- **[Documentation](https://ids.smonn.se)** — full guides, API reference, and playground
- **[SPEC.md](./SPEC.md)** — descriptive wire-format specification
- **[Design decisions](./docs/adr/)** — recorded ADRs
- **[CONTEXT.md](./CONTEXT.md)** — glossary of the project's vocabulary
- **[Contributing](./CONTRIBUTING.md)** · **[Security](./SECURITY.md)**

## License

[MIT](./LICENSE)
