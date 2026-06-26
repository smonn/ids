# Adapter error types: framework-native errors in transport adapters, `IdsError` in ORM adapters

The adapter layer in `src/adapters/` splits into two distinct ownership axes — transport-layer adapters (web frameworks and query runtimes) and ORM/data-layer adapters — and the two axes have opposite error-handling requirements. This ADR records the decision to use **framework-native errors in transport-layer adapters** and **`IdsError("invalid_id")` in ORM adapters**, and provides guidance for future adapter authors.

The divergence was first observed during the review of PR #407 (the GraphQL adapter), where the reviewer noted that `GraphQLError` rather than `IdsError` was an appropriate choice — consistent with the Hono, Express, Fastify, and NestJS adapters — but that the pattern had not yet been documented. `CONTRIBUTING.md`'s ADR threshold ("hard to reverse, surprising without context, and the result of a real trade-off") is met: future adapter authors have no documented guidance on which error type to choose, and the wrong choice has integration consequences that are hard to reverse without a breaking API change.

## Decision

### Transport-layer adapters: framework-native errors

The transport-layer adapters inject into the framework's error pipeline using framework-native types:

| Adapter | Error type | Mechanism |
| --- | --- | --- |
| `hono.ts` | `HTTPException` (Hono) | thrown; caught by `app.onError` |
| `express.ts` | `IdParamError extends Error` (adapter-defined) | forwarded via `next(err)` to Express error-handling middleware |
| `fastify.ts` | `IdParamError extends Error` (adapter-defined) | thrown; caught by `fastify.setErrorHandler` |
| `nestjs.ts` | `NotFoundException` / `BadRequestException` / `HttpException` (NestJS) | thrown from `PipeTransform.transform`; caught by NestJS exception filters |
| `graphql.ts` | `GraphQLError` (GraphQL) | thrown from scalar `parseValue` / `parseLiteral`; surfaced in the `errors` array by the GraphQL execution engine |

The shared `resolveIdParamFailure` helper in `adapter-types.ts` translates a `ParseError` into `{ reason, status }` for the web adapters (Hono, Express, Fastify, NestJS). The GraphQL adapter has no HTTP status concept and maps directly to `GraphQLError`.

#### `IdParamError` field-name convention

Both `express.ts` and `fastify.ts` define their own `IdParamError` class rather than sharing one. The HTTP-status field is named differently in each — `.status` in the Express adapter and `.statusCode` in the Fastify adapter — intentionally matching each framework's native error convention:

- **Express** error-handling middleware reads `err.status` (Express's own `http-errors` shape); using `.statusCode` would require explicit mapping in every app's error handler.
- **Fastify** `setErrorHandler` reads `err.statusCode` (Fastify's native error shape); using `.status` would silently fall back to a 500 response unless the handler explicitly checked for `.status`.

This is a deliberate per-framework choice, not an accidental inconsistency. Future transport-adapter `IdParamError` classes should follow the same convention: name the HTTP-status field whatever the target framework's own error-handling pipeline reads natively.

### ORM adapters: `IdsError("invalid_id")`

The ORM adapters throw `IdsError("invalid_id")` via the shared `readIdColumn` helper in `adapter-types.ts`:

| Adapter        | Helper                               | Error type               |
| -------------- | ------------------------------------ | ------------------------ |
| `drizzle.ts`   | `readIdColumn` in `fromDriver`       | `IdsError("invalid_id")` |
| `prisma.ts`    | `readIdColumn` in `idField.read`     | `IdsError("invalid_id")` |
| `kysely.ts`    | `readIdColumn` in `fromDb`           | `IdsError("invalid_id")` |
| `mikro-orm.ts` | `readIdColumn` in `convertToJSValue` | `IdsError("invalid_id")` |

The `invalid_id` code is consistent with `parse()` — same code, same `cause` chain carrying the underlying `ParseError` — so callers can handle a bad database value the same way they handle a bad user input that reached `parse()`.

## Rationale

### Why transport-layer adapters do not use `IdsError`

Each web framework defines the error type its error-handling pipeline recognizes. Hono's `onError`, Express's error-handling middleware, Fastify's `setErrorHandler`, NestJS's exception filters, and GraphQL's execution engine each expect their own native error class to trigger the right response rendering, HTTP status negotiation, and logging. Using `IdsError` here would require every application's framework error handler to be explicitly aware of this library's error class to produce a correct HTTP response — coupling the application's error pipeline to a library implementation detail that has nothing to do with the framework.

The `hono.ts` adapter's `HTTPException` path is already noted in ADR-0011's "What stays plain `Error`" table as "deliberately a framework error on the no-`onError` path; converting it would break the adapter's contract"; this ADR generalizes that note into a principled rule for the entire transport-layer axis.

### Why ORM adapters use `IdsError`

ORM adapters process database values at a **library boundary** — `readIdColumn` / `idField.read` / `fromDb` receive a raw database string and return a typed `Id<Brand>`. The caller is not a framework error pipeline; they are application code reading data, and they expect this library to signal an invalid ID the same way the library signals any invalid ID: via `IdsError`. There is no "framework pipeline" to inject into, and leaking an adapter-specific error class at the database boundary would be surprising and hard to catch generically.

The `invalid_id` code also aligns with ADR-0011's one-vocabulary rule: `invalid_id` is simultaneously the `IdsError.code` thrown by `parse()` and the code thrown by the ORM read helpers, so callers learn one concept and one catch pattern regardless of where an invalid ID surfaces.

## Guidance for future adapter authors

**Is this adapter injecting into a framework error pipeline (HTTP, GraphQL, WebSocket, RPC)?** → Use the framework-native error type. Never throw `IdsError` on the transport path.

**Is this adapter processing a library-internal value at a data-layer boundary (ORM read, database driver, message-queue deserializer)?** → Use `IdsError("invalid_id")` — preferably via `readIdColumn` or a shared helper that follows the same pattern — so callers can catch and discriminate errors using the library's stable error vocabulary. See [ADR-0011](./0011-coded-ids-error.md) for the full `IdsErrorCode` union and catch patterns.

The boundary test is: does the error need to be recognized by a framework's error-handling pipeline to produce a correct protocol-level response? If yes, use the framework's native type. If no, use `IdsError`.

## Considered Options

- **Always use `IdsError`** — rejected. Web framework error handlers expect framework-native types; an `IdsError` thrown by a Hono middleware bypasses Hono's `onError` HTTP-status treatment unless the application's error handler explicitly checks for it, coupling every app's error handler to this library. ORM callers cannot reasonably handle a framework error class at the database boundary.
- **Always use framework-native errors** — rejected. ORM adapters have no "framework" to speak of. There is no HTTP context or error-handling pipeline at the data layer, so there is no framework error class to use. `IdsError` is the correct signal at a library boundary and aligns with `parse()`.
- **One adapter-defined base class for all adapters** — rejected. An `IdsAdapterError extends IdsError` (or similar) that wraps framework errors would add surface and indirection without benefit: the framework pipelines would still not recognize it without explicit handler code, and ORM callers gain nothing from a new class over the existing `IdsError("invalid_id")`.
- **Two-tier rule (chosen)** — transport layer uses the framework's native error type; data layer uses `IdsError("invalid_id")`. The dividing line is the error pipeline: framework pipelines expect their own types, library boundaries expect `IdsError`.

## Consequences

- **ADR-0011 compatibility.** ADR-0011's code table and "What stays plain `Error`" note for `hono.ts`'s `HTTPException` are both consistent with this decision. No change to ADR-0011 is needed; this ADR extends its scope from the core error surface to the adapter layer.
- **Future transport adapters.** Any new transport-layer adapter (tRPC, WebSocket, connect-rpc, etc.) should throw the framework's native error type. The guiding question is whether the framework's error pipeline needs to recognize the error.
- **Future ORM / data-layer adapters.** Any new ORM or data-layer adapter should throw `IdsError("invalid_id")` on an invalid value, consistent with the shared `readIdColumn` pattern.
- **No code change.** This ADR documents the existing behavior of all shipped adapters. No adapter implementation is modified.
