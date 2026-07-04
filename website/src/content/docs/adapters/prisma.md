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

// Write path: write validates via codec.safeParse and returns the canonical string
await xprisma.user.create({ data: { id: userIdField.write(usr.generate()), name: "Alice" } });
```

`idField(codec)` requires `IdGeneratingCodec` — a codec variant exposing a synchronous `generate()`. Only the **Timestamp codec** and **Reverse Timestamp codec** satisfy this constraint; the Opaque, Signed, Wrapped, and Digest codecs do not expose a synchronous `generate()` and cannot be passed to `idField()`. For those codecs, use [`idFieldNonGenerating`](#non-generating-path-for-codecs-without-synchronous-generate--idfieldnongenerating) instead.

- **Write path:** `write` validates the value via `codec.safeParse` before passing it to the driver. A cast-smuggled or otherwise invalid string throws `IdsError("invalid_id")` at write time. Passing `null` or `undefined` also throws.
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

- **`create`** — when the field is absent, `undefined`, or `null` in `args.data`, injects a freshly generated `Id<Brand>`; when the field is present, validates it via `codec.safeParse` and throws `IdsError("invalid_id")` if invalid.
- **`createMany`** — iterates `args.data` (the array) and applies the same absent-injects / present-validates logic to each element.
- **`upsert`** — applies the same logic to `args.create` (the new-row data); the `update` side is left unchanged.

:::note[update / updateMany limitation]
`defaultQuery` only wraps the three generation-context operations (`create`, `createMany`, `upsert`). IDs supplied in `update` and `updateMany` data are **not** validated by `defaultQuery` — they are caller-owned. Validate them explicitly with `idField.write(value)` if needed.
:::

## Non-generating path for codecs without synchronous `generate()` — `idFieldNonGenerating`

Codecs that do not expose a synchronous `generate()` — the **Opaque Timestamp**, **Signed Timestamp**, **Wrapped key**, and **Digest** codecs — cannot be passed to `idField()`. Use `idFieldNonGenerating` for those variants. It accepts any `IdColumnCodec` (only `safeParse` is required) and returns the same read/transform surface as `idField` minus `defaultQuery`:

```ts
import { idFieldNonGenerating } from "@smonn/ids/prisma";
import { createOpaqueTimestampId, importOpaqueKey } from "@smonn/ids/opaque";

const key = await importOpaqueKey(rawKeyBytes);
const inv = createOpaqueTimestampId("inv", { key });
const invoiceIdField = idFieldNonGenerating(inv);

const xprisma = prisma.$extends({
  result: {
    invoice: { id: invoiceIdField.computeField("id") },
  },
});
// xprisma.invoice.findUnique(…).id is typed as Id<"inv"> — no cast required
```

`idFieldNonGenerating` returns `read`, `readNullable`, `write`, `computeField`, and `computeNullableField` — identical in behaviour to their `idField` counterparts. It does **not** return `defaultQuery`; that method requires `generate()`, which these codecs do not provide. The omission is enforced at the TypeScript type level: the return type is `Omit<IdTransform<Brand>, "defaultQuery">`.

The name reflects the provenance axis: this mapper does not generate IDs; it parses and serialises a caller-supplied value. It is **not** read-only — the return value includes a `write` method.

If you need `defaultQuery` (auto-generating IDs on `create`/`createMany`/`upsert`), use `idField` with a Timestamp or Reverse Timestamp codec instead.

:::note[Deprecated name]
`idFieldReadOnly` is a `@deprecated` alias of `idFieldNonGenerating` retained until 2.0. Existing code using `idFieldReadOnly` continues to work; migrate to `idFieldNonGenerating` when convenient.
:::

## Nullable columns

Both `idField(...)` and `idFieldNonGenerating(...)` expose `readNullable` and `computeNullableField` for optional foreign keys. Use `computeNullableField` in a `$extends` result block and `readNullable` for inline reads.

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

Both helpers are available on both `idField(...)` and `idFieldNonGenerating(...)` return values.

### `nullableIdField` — standalone nullable mapper

For nullable FK columns that only need read/write transforms and no `computeField`/`defaultQuery`, use `nullableIdField`:

```ts
import { nullableIdField } from "@smonn/ids/prisma";
import { createTimestampId } from "@smonn/ids";

const usr = createTimestampId("usr");
const authorIdField = nullableIdField(usr);

// Write: null/undefined → null; valid Id<Brand> → canonical string; invalid → throws
authorIdField.write(null); // → null  (FK clear)
authorIdField.write(undefined); // → null  (FK clear)
authorIdField.write(validId); // → canonical string
authorIdField.write("bad" as Id<"usr">); // throws IdsError("invalid_id")
```

`nullableIdField(codec)` returns `readNullable`, `write`, and `computeNullableField` — it is equivalent to the nullable surface of `idField`/`idFieldNonGenerating` but without the non-nullable read path or `defaultQuery`. The `write` method accepts `Id<Brand> | null | undefined` and returns `string | null`, matching the nullable FK clear pattern used by the Drizzle, Kysely, MikroORM, and TypeORM adapters.

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

:::note[Structural-only reads and writes]
The read and write paths call `codec.safeParse` only — HMAC tag verification (`safeVerify`) is not performed. If you store Signed Timestamp IDs and need to verify their tags, call `codec.safeVerify` explicitly at the service layer after reading.
:::
