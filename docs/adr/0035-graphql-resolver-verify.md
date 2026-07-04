# GraphQL signature verification is a resolver wrapper, not a scalar option

PR #917 gave the four HTTP adapters (Hono, Express, Fastify, NestJS) an opt-in `verify: true` option that authenticates a Signed Timestamp codec's HMAC tag on the read path. The GraphQL adapter was excluded because its scalar coercers are synchronous and cannot await the verification call. This ADR records the decision to close that gap with a **resolver wrapper** — `verifyIdArgs`, exported from `@smonn/ids/graphql` — rather than an option on `idScalar`, and why the resulting API deliberately diverges in shape from the four HTTP adapters.

`CONTRIBUTING.md`'s ADR threshold ("hard to reverse, surprising without context, and the result of a real trade-off") is met. A new public export is frozen once shipped, so its shape is hard to reverse. The divergence is surprising: a reader who has internalised #917's `verify: true` option will expect `idScalar(codec, { verify: true })` and wonder why GraphQL alone moves verification out to the resolver layer. And the choice is a real trade-off with genuine, rejected alternatives.

## Decision

Verification for GraphQL is exposed as a higher-order resolver wrapper:

```ts
verifyIdArgs(
  { userId: usr, orgId: org },        // map: arg name -> IdVerifiableCodec
  (root, args, ctx) => link(args.userId, args.orgId),
): GraphQLFieldResolver
```

The returned async resolver, for each `(argName, codec)` in the map: skips the arg when `args[argName]` is `null`/`undefined`; otherwise `await codec.safeVerify(args[argName])` and throws a `GraphQLError` with message `invalid <argName>` on failure, before the wrapped resolver runs. Present args are verified in map order and the first failure short-circuits. All pass → the original resolver is invoked with `args` unchanged.

- **`idScalar` is untouched.** The sync scalar keeps doing structural parse and brand discrimination on the inbound path (`parseValue`/`parseLiteral`); the wrapper adds the async HMAC check one layer out. Verification is purely additive.
- **The codec map is constrained to `IdVerifiableCodec` at compile time.** Passing a non-signed codec (no `safeVerify`) is a type error at the call site — the same static guarantee #917 gives via its overloads, expressed here as a constraint on the map's value type.
- **Failure is a framework-native `GraphQLError`**, per [ADR-0020](./0020-adapter-error-types.md). The message is coarse (`invalid <argName>`) and leaks no internal parse-error code, consistent with `idScalar`'s coarsening posture ([ADR-0003](./0003-canonical-strict-is.md) correction). The arg name is already public in the schema, so surfacing it discloses nothing.
- **Scope is top-level args only.** A signed ID nested inside an input-object arg is not reached by the flat `args[key]` lookup; this matches the single flat value the HTTP adapters verify. Nested-path support is a documented non-goal for now.

## Rationale

### Why not a `verify: true` option on `idScalar` (symmetry with #917)

GraphQL custom-scalar coercion (`parseValue`, `parseLiteral`) is **synchronous by the GraphQL-JS contract** — coercers cannot return a `Promise`, and the reference executor does not await scalar results. HMAC verification is asynchronous (`safeVerify` returns a `Promise`). There is therefore no point inside the scalar where the tag can be checked. The `verify: true`-on-the-parse-path shape #917 established is simply unavailable to GraphQL; matching it in name only, while the check silently happened somewhere else, would be worse than an honestly different shape. The asymmetry is forced by the execution model, not chosen for taste.

### Why a resolver wrapper over the documented inline `safeVerify` workaround

Before this change the adapter docs told every resolver author to call `codec.safeVerify` by hand in the resolver body. That is correct but unenforced — one forgotten call is an unauthenticated ID reaching business logic. A wrapper is composed **once per field** at the schema-wiring site, next to the resolver it guards, so the authentication step is visible in the field definition rather than buried (or missing) in each resolver body.

### Why the resolver layer, not schema middleware

graphql-js has no built-in field middleware. A schema-level plugin would require pulling in `graphql-middleware`, `@envelop`, or similar as a new peer dependency, breaking the zero-runtime-dependency posture every other adapter holds. The resolver is the first place after the sync scalar where async work is legal, and wrapping it needs nothing beyond graphql-js itself.

### Why a map of arg-name → codec

A single field can accept several signed-ID args of different brands (`userId` and `orgId`). A single-arg wrapper would force nesting one wrapper per arg; a map covers all of a field's ID args in one composition and keeps the failure message keyed to the offending arg.

## Considered Options

- **`idScalar(codec, { verify: true })`** — rejected. Impossible: scalar coercers are synchronous and cannot await `safeVerify`. This is the option #901/#917 originally imagined for GraphQL; the investigation this ADR records is what ruled it out.
- **Schema-level middleware / plugin** — rejected. Requires a new peer dependency (`graphql-middleware`/`@envelop`), contrary to the adapters' zero-runtime-dep rule.
- **Document the inline `codec.safeVerify` workaround only** — rejected as the end state. Correct but unenforced; every resolver must remember the call. Retained only as the pre-existing baseline this change supersedes.
- **Single-arg wrapper (`verifyIdArg(name, codec, resolver)`)** — rejected. Forces wrapper stacking for multi-ID fields; the map form subsumes it.
- **Resolver wrapper with a map of arg-name → `IdVerifiableCodec` (chosen)** — the only option that is executable within the GraphQL model, adds no dependency, enforces the check once per field, and scales to multiple ID args.

## Consequences

- **`verifyIdArgs` is a new public export** from `@smonn/ids/graphql`, additive alongside `idScalar`. No existing signature changes.
- **The `IdVerifiableCodec` glossary entry in `CONTEXT.md`** is corrected: the GraphQL adapter is no longer "excluded" — it verifies via the resolver wrapper rather than a scalar option.
- **`website/src/content/docs/adapters/graphql.md`** documents `verifyIdArgs` and supersedes the inline `safeVerify` resolver-body workaround previously noted there.
- **Guidance for future transport adapters.** When a framework's value-coercion boundary is synchronous but authentication is async, expose verification at the next async-legal composition point (here, the resolver) rather than forcing it into the sync coercer or matching a sibling adapter's option shape for symmetry's sake.
- **Nested input-object args remain uncovered** until a future change opts into path or recursion support; this is documented, not silent.
