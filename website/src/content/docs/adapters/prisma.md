---
title: Prisma adapter
description: Read/write transforms for integrating Id<Brand> with Prisma's $extends model.
---

`@smonn/ids/prisma` provides a read/write transform pair for integrating
`Id<Brand>` with Prisma's `$extends` extension model. It requires
`@prisma/client` as an **optional peer dependency**.

```bash
pnpm add @prisma/client
```

## Basic usage

```ts
import { idField } from "@smonn/ids/prisma";
import { createTimestampId } from "@smonn/ids";

const usr = createTimestampId("usr");
const userIdField = idField(usr);

const xprisma = prisma.$extends({
  result: {
    user: { id: userIdField.computeField("id") },
  },
});
// xprisma.user.findUnique(…).id is typed as Id<"usr"> — no cast required

// Write path: Id<Brand> is already canonical — pass it directly
await xprisma.user.create({ data: { id: userIdField.write(usr.generate()), name: "Alice" } });
```

`idField(codec)` requires `IdGeneratingCodec` — a codec variant exposing a synchronous `generate()`. Only the **Timestamp codec** and **Reverse Timestamp codec** satisfy this constraint; the Opaque, Signed, Wrapped, and Digest codecs do not expose a synchronous `generate()` and cannot be passed to `idField()` at all.

- **Write path:** `write` is an identity function — `Id<Brand>` is already canonical.
- **Read path:** values are normalised via `codec.safeParse()`. An unrecognised value throws at read time so corrupt data surfaces immediately.

## Auto-generating IDs on create — `defaultQuery`

Pair `defaultQuery` with `computeField` in a `$extends` block to have IDs auto-generated on write and correctly typed on read, without touching every call site:

```ts
import { idField } from "@smonn/ids/prisma";
import { createTimestampId } from "@smonn/ids";

const usr = createTimestampId("usr");
const userIdField = idField(usr);

const xprisma = prisma.$extends({
  query: { user: userIdField.defaultQuery("id") },
  result: { user: { id: userIdField.computeField("id") } },
});

// id is auto-filled on create, and typed as Id<"usr"> on read
await xprisma.user.create({ data: { name: "Alice" } });
```

The schema keeps a plain `String @id` with no `@default(…)`; the extension supplies the value client-side.

`defaultQuery` intercepts **`create`**, **`createMany`**, and **`upsert`**:

- **`create`** — injects a generated `Id<Brand>` into `args.data` when the field is absent, `undefined`, or `null`.
- **`createMany`** — iterates `args.data` (the array) and injects for each element where the field is absent or `null`.
- **`upsert`** — injects into `args.create` (the new-row data) when the field is absent or `null`; the `update` side is left unchanged.

An explicitly supplied value is always passed through unchanged. `update` and `updateMany` are never intercepted — they never create new rows.

## Error handling

The read path throws `IdsError` with code `"invalid_id"` when the stored value does not parse
as a valid `Id<Brand>`. The underlying `ParseError` is attached as `err.cause`. Catch and
narrow using `isIdsError`:

```ts
import { idField, isIdsError } from "@smonn/ids/prisma";

try {
  const id = userIdField.read(user.id);
} catch (err) {
  if (isIdsError(err) && err.code === "invalid_id") {
    // err.cause is the ParseError returned by safeParse
  }
}
```

`IdsError`, `isIdsError`, and `IdsErrorCode` are re-exported from `@smonn/ids/prisma` — no
separate import from `"@smonn/ids"` is needed. For the full list of `IdsErrorCode` values, see
the error-code reference.
