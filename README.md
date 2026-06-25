# @smonn/ids

Public-facing branded IDs for TypeScript apps. Type-safe, sortable, and codec-pluggable.

📖 **Full documentation & interactive playground: [ids.smonn.se](https://ids.smonn.se)**

```bash
pnpm add @smonn/ids
```

Each ID looks like `usr_01h7b3k9rqxn4cw3p9r8t2sgkw`: a three-letter brand, an
underscore, then 26 Crockford base32 characters of payload. The default
Timestamp codec encodes a 48-bit millisecond Unix timestamp followed by 80
random bits — the same byte layout as a [ULID](https://github.com/ulid/spec).

## Quickstart

```ts
import { type Id, createTimestampId } from "@smonn/ids";

const users = createTimestampId("usr");

// Generate — sortable by creation time via ORDER BY id
const id = users.generate(); // "usr_01h7b3k9rqxn4cw3p9r8t2sgkw"

// Branded: Id<"usr"> and Id<"org"> are not interchangeable
function loadUser(id: Id<"usr">) {
  /* ... */
}

// Validate untrusted input — lenient in, canonical out
const r = users.safeParse("USR_01H7B3K9RQXN1CW3P9R8T2SGKW");
if (r.ok) {
  r.id; // "usr_01h7b3k9rqxn1cw3p9r8t2sgkw" as Id<"usr">
}
```

`safeParse` accepts mixed case and the Crockford visual aliases (`o → 0`,
`i → 1`, `l → 1`) and always returns the canonical lowercase form. See the
[Timestamp codec guide](https://ids.smonn.se/codecs/timestamp/) for sorting,
backfills (`generateAt`), range queries, structured errors, Standard Schema, and
JSON Schema.

## Choosing a codec

All six codecs share the same `<brand>_<26 chars>` wire shape but make different
trade-offs. They are wire-indistinguishable, so codec choice is a per-brand
commitment.

| Codec             | Import               | Sort direction            | Key required       | Timestamp extractable      |
| ----------------- | -------------------- | ------------------------- | ------------------ | -------------------------- |
| Timestamp         | `@smonn/ids`         | Ascending (oldest-first)  | No                 | Always (plaintext)         |
| Reverse Timestamp | `@smonn/ids/reverse` | Descending (newest-first) | No                 | Always (plaintext)         |
| Signed Timestamp  | `@smonn/ids/signed`  | Ascending (oldest-first)  | Yes (signing key)  | Always (plaintext)         |
| Opaque Timestamp  | `@smonn/ids/opaque`  | None (encrypted)          | Yes (AES key)      | With key only              |
| Wrapped key       | `@smonn/ids/wrapped` | None                      | Yes (wrapping key) | N/A — not timestamp-family |
| Digest            | `@smonn/ids/digest`  | None                      | Yes (digest key)   | N/A — not timestamp-family |

- **Newest-first scans** on forward-only KV stores → [Reverse Timestamp](https://ids.smonn.se/codecs/reverse/)
- **Tamper-evident share links** verified without a DB lookup → [Signed Timestamp](https://ids.smonn.se/codecs/signed/) (integrity)
- **IDs that must not leak creation time** → [Opaque Timestamp](https://ids.smonn.se/codecs/opaque/) (confidentiality)
- **A public handle for an internal integer PK** → [Wrapped key](https://ids.smonn.se/codecs/wrapped/)
- **Idempotency keys, content-addressed records, or stable public pseudonyms** → [Digest](https://ids.smonn.se/codecs/digest/)

Try them all live in the [playground](https://ids.smonn.se/playground/).

## Integrations

Framework and ORM adapters ship as optional subpath exports (each requires its
own peer dependency):

- **HTTP route params:** [Hono](https://ids.smonn.se/adapters/hono/), [Express](https://ids.smonn.se/adapters/express/), [Fastify](https://ids.smonn.se/adapters/fastify/) — `idParam` middleware; [NestJS](https://ids.smonn.se/adapters/nestjs/) — `ParseIdPipe`
- **ORM columns:** [Drizzle](https://ids.smonn.se/adapters/drizzle/) — `idColumn`, [Kysely](https://ids.smonn.se/adapters/kysely/) — `idColumn`, [MikroORM](https://ids.smonn.se/adapters/mikro-orm/) — `idType`, [Prisma](https://ids.smonn.se/adapters/prisma/) — `idField`, [TypeORM](https://ids.smonn.se/adapters/typeorm/) — `idTransformer`
- **GraphQL:** [GraphQL](https://ids.smonn.se/adapters/graphql/) — `idScalar` custom scalar
- **CLI:** brand-agnostic `inspect` / `generate` / `keygen` — `npx @smonn/ids --help` ([docs](https://ids.smonn.se/cli/))

Every codec also implements [Standard Schema v1](https://standardschema.dev/), so
it slots into Zod, Valibot, ArkType, tRPC, and any validator-aware library.

## What this is **not** for

- **Internal surrogate primary keys.** If nobody outside your service sees the
  ID, the brand prefix and lenient parsing are dead weight. Use a `bigint`
  sequence.
- **Wire-compatible ULIDs.** The byte layout is ULID-shaped, but the encoding is
  lowercase and brand-wrapped. Stock ULID parsers will reject these.
- **Distributed-trace / request-correlation IDs.** Use OpenTelemetry-format IDs.
- **Hiding creation time with the Timestamp codec.** Anyone with one ID at a
  known creation time can compute the epoch offset. Use the Opaque Timestamp
  codec to hide creation time per-ID.

## Links

- **[Documentation](https://ids.smonn.se)** — full guides, API reference, and playground
- **[Design decisions](./docs/adr/)** — recorded ADRs
- **[CONTEXT.md](./CONTEXT.md)** — glossary of the project's vocabulary
- **[Contributing](./CONTRIBUTING.md)** · **[Security](./SECURITY.md)**

## License

[MIT](./LICENSE)
