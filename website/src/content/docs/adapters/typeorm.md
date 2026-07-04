---
title: TypeORM adapter
description: Column transformer for integrating Id<Brand> with TypeORM's column transformer option.
---

`@smonn/ids/typeorm` provides a column transformer for integrating `Id<Brand>`
with TypeORM's `@Column` decorator `transformer` option. It requires `typeorm`
as an **optional peer dependency**.

```bash
pnpm add typeorm
```

```ts
import { idTransformer } from "@smonn/ids/typeorm";
import { createTimestampId } from "@smonn/ids";
import type { Id } from "@smonn/ids";
import { Column, Entity } from "typeorm";

const usr = createTimestampId("usr");

@Entity()
class User {
  @Column({ type: "text", transformer: idTransformer(usr) })
  id!: Id<"usr">;
}
```

`idTransformer(codec)` works with any codec variant.

- **Write path:** `to` validates the value via `codec.safeParse` before passing it to the driver. A cast-smuggled or otherwise invalid string throws `IdsError("invalid_id")` at write time. Passing `null` or `undefined` also throws — use `nullableIdTransformer` for nullable columns.
- **Read path:** values are normalised via `codec.safeParse()`. An unrecognised
  value throws at read time so corrupt data surfaces immediately.

## Auto-generating IDs on insert — `beforeInsertHook`

`beforeInsertHook(fieldName, codec)` returns a function suitable for use inside a TypeORM `@BeforeInsert()` lifecycle hook. It auto-generates an `Id<Brand>` for `fieldName` when the field is absent (`null` or `undefined`) on the entity at insert time; if the field already has a value it is left unchanged.

Pair it with `idTransformer` on the same column: `idTransformer` handles the database read/write path; `beforeInsertHook` handles generation.

```ts
import { idTransformer, beforeInsertHook } from "@smonn/ids/typeorm";
import { createTimestampId } from "@smonn/ids";
import type { Id } from "@smonn/ids";
import { BeforeInsert, Column, Entity } from "typeorm";

const usr = createTimestampId("usr");
const fillUserId = beforeInsertHook("id", usr);

@Entity()
class User {
  @Column({ type: "text", transformer: idTransformer(usr) })
  id!: Id<"usr">;

  @BeforeInsert()
  generateId() {
    fillUserId(this);
  }
}
```

`beforeInsertHook` requires `IdGeneratingCodec` — a codec that exposes a synchronous `generate()`. Only the **Timestamp codec** and **Reverse Timestamp codec** qualify; Opaque, Signed, Wrapped, and Digest codecs are a compile-time error. For those codecs, generate the ID explicitly at the call site and assign it before persisting.

## Nullable columns

`nullableIdTransformer(codec)` returns a TypeORM `ValueTransformer` whose `from` returns `null` for `null` / `undefined` database values and whose `to` normalises `null` and `undefined` to `null`. Use it for optional foreign keys.

```ts
import { nullableIdTransformer } from "@smonn/ids/typeorm";
import { createTimestampId } from "@smonn/ids";
import type { Id } from "@smonn/ids";
import { Column, Entity } from "typeorm";

const usr = createTimestampId("usr");

@Entity()
class Post {
  @Column({ type: "text", nullable: true, transformer: nullableIdTransformer(usr) })
  authorId!: Id<"usr"> | null;
}
```

- **Read path (`from`):** returns `null` for `null` / `undefined` database values. Non-null values go through `codec.safeParse()` and throw `IdsError("invalid_id")` if they do not parse as a valid `Id<Brand>`.
- **Write path (`to`):** `null` and `undefined` are normalised to `null`; non-null values are validated via `codec.safeParse` and an invalid string throws `IdsError("invalid_id")` at write time.

## Error handling

The read path throws `IdsError` with code `"invalid_id"` when the stored value does not parse
as a valid `Id<Brand>`. The underlying `ParseError` is attached as `err.cause`. Catch and
narrow using `isIdsError`:

```ts
import { idTransformer, isIdsError } from "@smonn/ids/typeorm";
import { createTimestampId } from "@smonn/ids";

const usr = createTimestampId("usr");
const transformer = idTransformer(usr);

try {
  const id = transformer.from(row.id);
} catch (err) {
  if (isIdsError(err) && err.code === "invalid_id") {
    // err.cause is the ParseError returned by safeParse
  }
}
```

`IdsError`, `isIdsError`, and `IdsErrorCode` are re-exported from `@smonn/ids/typeorm` — no
separate import from `"@smonn/ids"` is needed. For the full list of `IdsErrorCode` values, see
the [error-code reference](/errors).

:::caution[TypeORM branding caveat]
TypeORM cannot brand a generated entity field type at the schema level. Annotate
the entity field explicitly: `id!: Id<"usr">`. This is a TypeORM type-system
constraint, not a library limitation.
:::

:::note[Structural-only reads and writes]
The read and write paths call `codec.safeParse` only — HMAC tag verification (`safeVerify`) is not performed. If you store Signed Timestamp IDs and need to verify their tags, call `codec.safeVerify` explicitly at the service layer after reading.
:::
