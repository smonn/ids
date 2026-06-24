---
title: Kysely adapter
description: A Kysely column adapter bound to an @smonn/ids codec.
---

`@smonn/ids/kysely` provides a Kysely column adapter bound to a codec. It
requires `kysely` as an **optional peer dependency**.

```bash
pnpm add kysely
```

```ts
import { idColumn, type IdColumnType } from "@smonn/ids/kysely";
import { createTimestampId } from "@smonn/ids";

const usr = createTimestampId("usr");
const usrCol = idColumn(usr);

interface Database {
  users: { id: IdColumnType<"usr"> };
}

// Kysely has no runtime transformer — fromDriver/toDriver do NOT fire
// automatically. Call fromDriver() manually on every read result. The
// `as unknown as string` cast is required because TypeScript already sees
// row.id as Id<"usr"> (from the Database interface), even though the raw DB
// value is a plain string at runtime.
const row = await db.selectFrom("users").selectAll().executeTakeFirstOrThrow();
const id = usrCol.fromDriver(row.id as unknown as string);
```

`idColumn(codec)` works with any codec variant.

- **Write path:** `toDriver` passes the already-canonical `Id<Brand>` unchanged.
- **Read path:** `fromDriver` normalises the raw DB string via
  `codec.safeParse()`. An unrecognised value throws at read time so corrupt data
  surfaces immediately.

## Error handling

The read path throws `IdsError` with code `"invalid_id"` when the stored value does not parse
as a valid `Id<Brand>`. The underlying `ParseError` is attached as `err.cause`. Catch and
narrow using `isIdsError`:

```ts
import { idColumn, isIdsError } from "@smonn/ids/kysely";

try {
  const id = usrCol.fromDriver(row.id as unknown as string);
} catch (err) {
  if (isIdsError(err) && err.code === "invalid_id") {
    // err.cause is the ParseError returned by safeParse
  }
}
```

`IdsError`, `isIdsError`, and `IdsErrorCode` are re-exported from `@smonn/ids/kysely` — no
separate import from `"@smonn/ids"` is needed. For the full list of `IdsErrorCode` values, see
the error-code reference.
