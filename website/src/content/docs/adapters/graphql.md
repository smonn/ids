---
title: GraphQL adapter
description: Build a GraphQLScalarType for an @smonn/ids codec.
---

`@smonn/ids/graphql` provides `idScalar` — a factory that builds a
`GraphQLScalarType` bound to a codec and brand. `graphql` is an **optional peer
dependency**.

```bash
pnpm add graphql
```

```ts
import { idScalar } from "@smonn/ids/graphql";
import { createTimestampId } from "@smonn/ids";

const usr = createTimestampId("usr");

export const UserIdScalar = idScalar(usr, {
  name: "UserId",
  description: "A branded user ID.",
});
```

`idScalar(codec, config)` works with any codec variant — any object exposing
`safeParse` and `is` satisfies the required interface (Timestamp, Opaque
Timestamp, Reverse Timestamp, Signed Timestamp, Digest, and Wrapped key codecs
all qualify).

## Scalar behaviour

- **`serialize`** — validates **strictly** via `codec.is()` and throws
  `GraphQLError` on a non-canonical value (e.g. an uppercase string that a
  resolver produced via an unsafe cast). Returns the value **unchanged** on
  success — no normalization. This is the trusted outbound path: a
  non-canonical value surfaces as an error rather than being silently
  corrected.
- **`parseValue`** — validates variable values via `codec.safeParse`; throws
  `GraphQLError` on brand mismatch or malformed input. Accepts mixed-case and
  Crockford visual aliases (`o → 0`, `i → 1`, `l → 1`); always returns the
  canonical lowercase form.
- **`parseLiteral`** — validates inline `Kind.STRING` literals the same way as
  `parseValue`; throws `GraphQLError` for any non-string AST kind (e.g.
  `Kind.INT`, `Kind.BOOLEAN`).

The asymmetry between `serialize` (strict) and `parseValue`/`parseLiteral`
(lenient) follows ADR-0003: `serialize` is on the trusted outbound path, while
the parse hooks are on the untrusted inbound path.

## Error model

Unlike the web adapters, `idScalar` throws `GraphQLError` directly — not
`IdsError` or an `IdParamFailure`. This matches the GraphQL execution model
where scalar coercers signal failure via `GraphQLError`. Error messages use a
coarse shape (`invalid <ScalarName>`) that does not expose internal parse-error
codes to clients.

## Signature verification

`idScalar` itself does not verify HMAC tags. GraphQL scalar coercers (`parseValue`, `parseLiteral`) must be synchronous, and Signed Timestamp tag verification is asynchronous — so the check cannot live inside the scalar. Instead, `@smonn/ids/graphql` exports `verifyIdArgs`, a resolver wrapper that authenticates named ID arguments one layer out, before the resolver body runs.

```ts
import { idScalar, verifyIdArgs } from "@smonn/ids/graphql";
import { createSignedTimestampId } from "@smonn/ids";

const usr = createSignedTimestampId("usr", { keys: [signingKey] });
const UserId = idScalar(usr, { name: "UserId" });

const resolvers = {
  Query: {
    // `args.id` is a structurally-valid Id<"usr"> (checked by the scalar) *and*
    // has an authenticated tag (checked by verifyIdArgs) before this runs.
    user: verifyIdArgs({ id: usr }, (_root, args, ctx) => ctx.loadUser(args.id)),
  },
};
```

Pass a map of argument name to a **Signed Timestamp codec** (the only codec that satisfies the required `IdVerifiableCodec` interface — a non-signed codec is a compile-time type error). For each entry, `verifyIdArgs` calls `codec.safeVerify(args[name])`; a forged or tampered tag throws a `GraphQLError` (message `invalid <argName>`) **before** the wrapped resolver runs. A `null`/`undefined` argument is skipped, so the wrapper is safe on optional ID args. One wrapper can cover several ID arguments of different brands:

```ts
verifyIdArgs({ userId: usr, orgId: org }, (_root, args, ctx) => ctx.link(args.userId, args.orgId));
```

Verification covers **top-level arguments only** — an ID nested inside an input-object argument is not reached; verify it in the resolver body with `codec.safeVerify` if you need to. See [ADR-0035](https://github.com/smonn/ids/blob/main/docs/adr/0035-graphql-resolver-verify.md) for why GraphQL verification is a resolver wrapper rather than a `verify: true` option like the HTTP adapters.
