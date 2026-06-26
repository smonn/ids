---
title: MikroORM adapter
description: A MikroORM custom Type bound to an @smonn/ids codec.
---

`@smonn/ids/mikro-orm` provides a MikroORM custom `Type` subclass bound to a
codec. It requires `@mikro-orm/core` as an **optional peer dependency**.

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

- **Write path:** `convertToDatabaseValue` passes the already-canonical
  `Id<Brand>` to the driver unchanged.
- **Read path:** `convertToJSValue` normalises the raw DB value via
  `codec.safeParse()`. An unrecognised value throws at read time so corrupt
  data surfaces immediately.
- **Column type:** `getColumnType` returns `"text"` by default; pass
  `{ columnType: "..." }` as the second argument to `idType` to override
  (e.g. `idType(usr, { columnType: "varchar(30)" })`).

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
