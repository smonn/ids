---
title: Framework integrations (tRPC, oRPC, TanStack, Zod, Next, …)
description: Libraries with no dedicated @smonn/ids subpath still work out of the box — they ride on the universal surfaces every codec exposes (~standard, toJsonSchema(), safeParse).
---

Some libraries get a dedicated **adapter** — `@smonn/ids/hono`,
`@smonn/ids/drizzle`, and friends ship real code, a subpath export, and an
optional peer dependency. See the [Adapters](/adapters/express/) section for
those.

Many other libraries need **no adapter at all**. tRPC, oRPC, TanStack Router,
Zod, Valibot, ArkType, and Next.js all integrate through the universal surfaces
that [every codec already exposes](/validation/):

- **`~standard`** — [Standard Schema v1](https://standardschema.dev/), so the
  codec drops into any boundary that *consumes* a Standard Schema validator.
- **`toJsonSchema()`** — synchronous JSON Schema for OpenAPI generation.
- **`safeParse` / `is`** — boundary validation anywhere else.

:::note[Adapter vs. integration]
If there's a `@smonn/ids/<name>` import, it's an **adapter** — you install a
peer dep and import code. If there isn't, it's an **integration** — there is
nothing to install beyond `@smonn/ids` itself; you pass the codec, or call one
of its universal surfaces, directly.
:::

There are three patterns, and which one a library uses depends on **whether it
consumes Standard Schema** — not merely whether it supports it. Producing
Standard Schema (exposing `~standard` on your own schemas) is the opposite
direction from consuming it (accepting someone else's). The distinction decides
the snippet.

## 1. Pass the codec directly — input & route boundaries

These boundaries **consume** a Standard Schema validator for an input value, so
a codec slots straight in. The result is the canonical `Id<Brand>`, fully typed.

### tRPC

`procedure.input()` accepts [any Standard Schema validator](https://trpc.io/docs/server/validators).
When the whole input *is* the ID, pass the codec:

```ts
import { createTimestampId } from "@smonn/ids";
import { publicProcedure } from "./trpc";

const users = createTimestampId("usr");

export const getUser = publicProcedure
  .input(users) // Standard Schema validator
  .query(({ input }) => {
    // input: Id<"usr">, canonical
  });
```

tRPC validates the entire input with a single schema. For a multi-field input
(`{ userId, ... }`), compose an object schema and embed the codec as a member —
see [§2](#2-compose-inside-a-schema-library).

### oRPC

oRPC's `.input()` accepts [any Standard Schema library](https://orpc.dev/docs/procedure)
too:

```ts
import { os } from "@orpc/server";
import { createTimestampId } from "@smonn/ids";

const users = createTimestampId("usr");

export const getUser = os
  .input(users) // Standard Schema validator
  .handler(({ input }) => {
    // input: Id<"usr">, canonical
  });
```

### TanStack Router

[`validateSearch`](https://tanstack.com/router/latest/docs/how-to/validate-search-params)
consumes a Standard Schema for the **whole search object**, so embed the codec
in an object schema there. For **path params**, validate the single segment with
`~standard.validate`:

```ts
import { createFileRoute } from "@tanstack/react-router";
import { createTimestampId } from "@smonn/ids";

const users = createTimestampId("usr");

export const Route = createFileRoute("/users/$userId")({
  params: {
    parse: ({ userId }) => {
      const result = users["~standard"].validate(userId);
      if (result.issues) throw new Error(result.issues[0].message);
      return { userId: result.value }; // Id<"usr">, canonical
    },
    stringify: ({ userId }) => ({ userId }),
  },
});
```

TanStack Start server functions accept a Standard Schema validator the same way
tRPC does — pass the codec to `.validator()`.

## 2. Compose inside a schema library

Schema libraries (ArkType, Zod, Valibot) **produce** Standard Schema. Whether
you can embed a codec as a *member* of one of their object schemas depends on
whether that library also **consumes** foreign Standard Schemas.

### ArkType — embed directly

ArkType accepts a codec as a schema member:

```ts
import { type } from "arktype";
import { createTimestampId } from "@smonn/ids";

const users = createTimestampId("usr");

const Body = type({ userId: users });

const r = Body({ userId: "USR_06F80Z92D2DBSQQG28T5CY4TQG" });
// → { userId: "usr_06f80z92d2dbsqqg28t5cy4tqg" } typed as { userId: Id<"usr"> }
```

### Zod — wrap with `z.custom` / `transform`

Zod (including v4) implements Standard Schema, but only as a **producer** — it
has no combinator to consume a foreign Standard Schema, so you cannot drop a
codec into `z.object({ userId: <codec> })`. Wrap `safeParse` instead:

```ts
import { z } from "zod";
import { createTimestampId, type Id } from "@smonn/ids";

const users = createTimestampId("usr");

// Type guard only — keeps the value as-is:
const userId = z.custom<Id<"usr">>((v) => users.safeParse(v).ok);

// Or normalize to the canonical Id:
const userIdCanonical = z.string().transform((v, ctx) => {
  const r = users.safeParse(v);
  if (!r.ok) {
    ctx.addIssue({ code: "custom", message: r.error });
    return z.NEVER;
  }
  return r.id; // Id<"usr">, canonical
});
```

### Valibot — wrap with `v.custom`

Valibot is in the same position as Zod — a Standard Schema producer, not a
consumer of foreign ones. Use `v.custom`:

```ts
import * as v from "valibot";
import { createTimestampId, type Id } from "@smonn/ids";

const users = createTimestampId("usr");

const userId = v.custom<Id<"usr">>((input) => users.safeParse(input).ok);
```

To canonicalize rather than only validate, pipe `v.string()` through a transform
that returns `users.safeParse(input).id` on success.

## 3. Plain boundary validation

Anywhere without a Standard Schema hook — Next.js route handlers and server
actions, raw HTTP handlers, queue consumers — call `safeParse` at the boundary.
It is lenient (accepts mixed case and Crockford aliases) and returns the
canonical `Id<Brand>`:

```ts
// app/api/users/[id]/route.ts
import { createTimestampId } from "@smonn/ids";

const users = createTimestampId("usr");

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = users.safeParse(id);
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 400 });
  }
  const userId = result.id; // Id<"usr">, canonical
  // ...
}
```

For OpenAPI documents generated by Next.js (or any framework), feed
`toJsonSchema()` into your `components.schemas`:

```ts
components.schemas.UserId = users.toJsonSchema();
// { type: "string", pattern: "^usr_...$", description: "...", example: "..." }
```

## Summary

| Library                      | Mechanism                              | What you pass                          |
| ---------------------------- | -------------------------------------- | -------------------------------------- |
| tRPC, oRPC                   | Consumes Standard Schema at `.input()` | The codec directly                     |
| TanStack (Router / Start)    | Consumes Standard Schema               | Codec (search/server fn); `~standard.validate` for path params |
| ArkType                      | Consumes Standard Schema as a member   | The codec inside `type({ … })`         |
| Zod, Valibot                 | Produce only — no foreign consume      | `z.custom` / `v.custom` around `safeParse` |
| Next.js, raw handlers        | No schema hook                         | `safeParse` at the boundary; `toJsonSchema()` for OpenAPI |

If your library isn't listed, the rule still holds: **does it consume a Standard
Schema?** If yes, pass the codec. If no, call `safeParse` at the boundary. For
OpenAPI, reach for `toJsonSchema()`. See [Validation](/validation/) for the full
reference on these surfaces.
