---
title: Prisma adapter
description: Read/write transforms for integrating Id<Brand> with Prisma's $extends model.
---

`@smonn/ids/prisma` provides a read/write transform pair for integrating
`Id<Brand>` with Prisma's `$extends` extension model. It requires
`@prisma/client` **≥ 7.0.0** as an **optional peer dependency**.

```bash
pnpm add @prisma/client@">=7"
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

`idField(codec)` requires `IdGeneratingCodec` — a codec variant exposing a synchronous `generate()`. Only the **Timestamp codec** and **Reverse Timestamp codec** satisfy this constraint; the Opaque, Signed, Wrapped, and Digest codecs do not expose a synchronous `generate()` and cannot be passed to `idField()`. For those codecs, use [`idFieldReadOnly`](#read-only-path-for-non-generating-codecs--idfieldreadonly) instead.

- **Write path:** `write` passes the canonical `Id<Brand>` through unchanged. Passing `null` or `undefined` throws `IdsError("invalid_id")` at runtime.
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

## Read-only path for non-generating codecs — `idFieldReadOnly`

Codecs that do not expose a synchronous `generate()` — the **Opaque Timestamp**, **Signed Timestamp**, **Wrapped key**, and **Digest** codecs — cannot be passed to `idField()`. Use `idFieldReadOnly` for those variants. It accepts any `IdColumnCodec` (only `safeParse` is required) and returns the same read/transform surface as `idField` minus `defaultQuery`:

```ts
import { idFieldReadOnly } from "@smonn/ids/prisma";
import { createOpaqueTimestampId, importOpaqueKey } from "@smonn/ids/opaque";

const key = await importOpaqueKey(rawKeyBytes);
const inv = createOpaqueTimestampId("inv", { key });
const invoiceIdField = idFieldReadOnly(inv);

const xprisma = prisma.$extends({
  result: {
    invoice: { id: invoiceIdField.computeField("id") },
  },
});
// xprisma.invoice.findUnique(…).id is typed as Id<"inv"> — no cast required
```

`idFieldReadOnly` returns `read`, `readNullable`, `write`, `computeField`, and `computeNullableField` — identical in behaviour to their `idField` counterparts. It does **not** return `defaultQuery`; that method requires `generate()`, which these codecs do not provide. The omission is enforced at the TypeScript type level: the return type is `Omit<IdTransform<Brand>, "defaultQuery">`.

If you need `defaultQuery` (auto-generating IDs on `create`/`createMany`/`upsert`), use `idField` with a Timestamp or Reverse Timestamp codec instead.

## Nullable columns

Both `idField(...)` and `idFieldReadOnly(...)` expose `readNullable` and `computeNullableField` for optional foreign keys. Use `computeNullableField` in a `$extends` result block and `readNullable` for inline reads.

### `computeNullableField` in a `$extends` block

```ts
import { idField } from "@smonn/ids/prisma";
import { createTimestampId } from "@smonn/ids";

const usr = createTimestampId("usr");
const userIdField = idField(usr);
const pst = createTimestampId("pst");
const postIdField = idField(pst);

const xprisma = prisma.$extends({
  result: {
    post: {
      // non-nullable primary key
      id: postIdField.computeField("id"),
      // nullable optional FK — author may be null
      authorId: userIdField.computeNullableField("authorId"),
    },
  },
});

// xprisma.post.findUnique(…).authorId is typed as Id<"usr"> | null
const post = await xprisma.post.findUnique({ where: { id: someId } });
console.log(post?.authorId); // Id<"usr"> | null
```

### `readNullable` for inline reads

```ts
const authorId = userIdField.readNullable(rawRow.authorId);
// authorId is Id<"usr"> | null — null when rawRow.authorId is null or undefined
```

- `readNullable` returns `null` when the value is `null` or `undefined`; for any other value it delegates to the same `safeParse`-based path as `read` and throws `IdsError("invalid_id")` on failure.
- `computeNullableField(fieldName)` produces a `$extends` result-component field whose `compute` function returns `Id<Brand> | null`, correctly typed through Prisma's type machinery without a per-call-site cast.

Both helpers are available on both `idField(...)` and `idFieldReadOnly(...)` return values.

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
