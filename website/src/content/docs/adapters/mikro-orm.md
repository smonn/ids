---
title: MikroORM adapter
description: A MikroORM custom Type bound to an @smonn/ids codec, with optional onCreate auto-generation.
---

`@smonn/ids/mikro-orm` provides a MikroORM custom `Type` subclass bound to a
codec, and an `idField` helper that wires `codec.generate()` into the
`onCreate` lifecycle hook for automatic ID generation on first persist. It
requires `@mikro-orm/core` as an **optional peer dependency**.

```bash
pnpm add @mikro-orm/core
```

```ts
import { Entity, PrimaryKey } from "@mikro-orm/core";
import { idType } from "@smonn/ids/mikro-orm";
import { createTimestampId } from "@smonn/ids";
import type { Id } from "@smonn/ids";

const usr = createTimestampId("usr");

@Entity()
class User {
  @PrimaryKey({ type: idType(usr) })
  id!: Id<"usr">;
}
```

`idType(codec)` works with any codec variant — any codec that exposes
`safeParse` satisfies the required interface (Timestamp, Opaque Timestamp,
Reverse Timestamp, Signed Timestamp, Digest, and Wrapped key codecs all qualify).

- **Write path:** `convertToDatabaseValue` validates the value via `codec.safeParse` before passing it to the driver. A cast-smuggled or otherwise invalid string throws `IdsError("invalid_id")` at write time. Passing `null` or `undefined` also throws — use `nullableIdType` for nullable columns.
- **Read path:** `convertToJSValue` normalises the raw DB value via
  `codec.safeParse()`. An unrecognised value throws at read time so corrupt
  data surfaces immediately.
- **Column type:** `getColumnType` returns `"text"` by default; pass
  `{ columnType: "..." }` as the second argument to `idType` to override
  (e.g. `idType(usr, { columnType: "varchar(30)" })`).

## Auto-generating IDs on create — `idField`

`idField(codec)` returns a MikroORM property options object that wires
`codec.generate()` into the `onCreate` lifecycle hook, so the field
auto-fills on first persist without any per-call-site wiring:

```ts
import { Entity, PrimaryKey } from "@mikro-orm/core";
import { idField } from "@smonn/ids/mikro-orm";
import { createTimestampId } from "@smonn/ids";
import type { Id } from "@smonn/ids";

const usr = createTimestampId("usr");

@Entity()
class User {
  @PrimaryKey(idField(usr))
  id!: Id<"usr">;
}
```

`idField(usr)` is equivalent to writing `{ type: idType(usr), onCreate: () => usr.generate() }` by hand, but keeps the decorator call-site clean.

`idField` requires `IdGeneratingCodec` — a codec variant that exposes a
synchronous `generate()`. Only the **Timestamp codec** and **Reverse Timestamp
codec** satisfy this constraint; the Opaque, Signed, Wrapped, and Digest codecs
do not expose a synchronous `generate()` and cannot be passed to `idField()`.
For those codecs, use `idType` directly and supply the ID at the call site.

## Nullable columns

`nullableIdType(codec)` returns a MikroORM `Type` subclass whose `convertToJSValue` returns `null` for `null` / `undefined` database values. Use it for optional foreign keys.

```ts
import { Entity, Property } from "@mikro-orm/core";
import { nullableIdType } from "@smonn/ids/mikro-orm";
import { createTimestampId } from "@smonn/ids";
import type { Id } from "@smonn/ids";

const usr = createTimestampId("usr");

@Entity()
class Post {
  @Property({ type: nullableIdType(usr), nullable: true })
  authorId!: Id<"usr"> | null;
}

// explicit varchar column — matches existing DDL
class Comment {
  @Property({ type: nullableIdType(usr, { columnType: "varchar(30)" }), nullable: true })
  authorId!: Id<"usr"> | null;
}
```

- **Read path:** `convertToJSValue` returns `null` for `null` / `undefined` database values. Non-null values go through `codec.safeParse()` and throw `IdsError("invalid_id")` if they do not parse as a valid `Id<Brand>`.
- **Write path:** `convertToDatabaseValue` normalises `null` and `undefined` to `null`; non-null values are validated via `codec.safeParse` and an invalid string throws `IdsError("invalid_id")` at write time.
- **Column type:** `getColumnType` returns `"text"` by default; pass `{ columnType: "..." }` as the second argument to `nullableIdType` to override (e.g. `nullableIdType(usr, { columnType: "char(26)" })`).

## Error handling

The read path throws `IdsError` with code `"invalid_id"` when the stored value
does not parse as a valid `Id<Brand>`. The underlying `ParseError` is attached
as `err.cause`. Catch and narrow using `isIdsError`:

```ts
import { idType, isIdsError } from "@smonn/ids/mikro-orm";

try {
  // query that triggers a read through idType
} catch (err) {
  if (isIdsError(err) && err.code === "invalid_id") {
    // err.cause is the ParseError returned by safeParse
  }
}
```

`IdsError`, `isIdsError`, and `IdsErrorCode` are re-exported from
`@smonn/ids/mikro-orm` — no separate import from `"@smonn/ids"` is needed. For
the full list of `IdsErrorCode` values, see the [error-code reference](/errors).

:::note[Structural-only reads and writes]
The read and write paths call `codec.safeParse` only — HMAC tag verification (`safeVerify`) is not performed. If you store Signed Timestamp IDs and need to verify their tags, call `codec.safeVerify` explicitly at the service layer after reading.
:::
