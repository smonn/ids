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
`safeParse` satisfies the required interface (Timestamp, Opaque Timestamp,
Reverse Timestamp, Signed Timestamp, Digest, and Wrapped key codecs all
qualify).

## Scalar behaviour

- **`serialize`** — identity pass-through; an `Id<Brand>` is already the
  canonical wire string, so it is returned as-is.
- **`parseValue`** — validates variable values via `codec.safeParse`; throws
  `GraphQLError` on brand mismatch or malformed input. Accepts mixed-case and
  Crockford visual aliases (`o → 0`, `i → 1`, `l → 1`); always returns the
  canonical lowercase form.
- **`parseLiteral`** — validates inline `Kind.STRING` literals the same way as
  `parseValue`; throws `GraphQLError` for any non-string AST kind (e.g.
  `Kind.INT`, `Kind.BOOLEAN`).

## Error model

Unlike the web adapters, `idScalar` throws `GraphQLError` directly — not
`IdsError` or an `IdParamFailure`. This matches the GraphQL execution model
where scalar coercers signal failure via `GraphQLError`.
