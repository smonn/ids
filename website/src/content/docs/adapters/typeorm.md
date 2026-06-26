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

- **Write path:** `to` is an identity function — `Id<Brand>` is already
  canonical.
- **Read path:** values are normalised via `codec.safeParse()`. An unrecognised
  value throws at read time so corrupt data surfaces immediately.

## Nullable columns

`nullableIdTransformer(codec)` returns a TypeORM `ValueTransformer` whose `from` returns `null` for `null` / `undefined` database values and whose `to` passes `null` / `undefined` through unchanged. Use it for optional foreign keys.

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
- **Write path (`to`):** `null` and `undefined` are passed through unchanged; `Id<Brand>` values are passed through as canonical strings.

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
