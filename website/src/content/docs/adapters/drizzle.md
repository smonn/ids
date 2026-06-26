---
title: Drizzle adapter
description: A Drizzle custom column type bound to an @smonn/ids codec.
---

`@smonn/ids/drizzle` provides Drizzle custom column types bound to a codec. It
requires `drizzle-orm` as an **optional peer dependency**.

```bash
pnpm add drizzle-orm
```

## PostgreSQL

```ts
import { pgTable } from "drizzle-orm/pg-core";
import { idColumn } from "@smonn/ids/drizzle";
import { createTimestampId } from "@smonn/ids";

const usr = createTimestampId("usr");

export const users = pgTable("users", {
  id: idColumn(usr).primaryKey(),
});
// users.id is typed as Id<"usr"> end-to-end
```

## MySQL

```ts
import { mysqlTable } from "drizzle-orm/mysql-core";
import { idColumnMysql } from "@smonn/ids/drizzle";
import { createTimestampId } from "@smonn/ids";

const usr = createTimestampId("usr");

export const users = mysqlTable("users", {
  id: idColumnMysql(usr).primaryKey(),
});
// users.id is typed as Id<"usr"> end-to-end
```

## SQLite

```ts
import { sqliteTable } from "drizzle-orm/sqlite-core";
import { idColumnSqlite } from "@smonn/ids/drizzle";
import { createTimestampId } from "@smonn/ids";

const usr = createTimestampId("usr");

export const users = sqliteTable("users", {
  id: idColumnSqlite(usr).primaryKey(),
});
// users.id is typed as Id<"usr"> end-to-end
```

All three column builders (`idColumn`, `idColumnMysql`, `idColumnSqlite`) work with
any codec variant — any codec that exposes `safeParse` satisfies the required interface
(Timestamp, Opaque Timestamp, Reverse Timestamp, Signed Timestamp, Digest, and Wrapped
key codecs all qualify).

- **Write path:** `Id<Brand>` is already canonical, so it is passed to the driver unchanged.
- **Read path:** values are normalised via `codec.safeParse()` rather than the strict `is()`. Data at rest should already be canonical ([ADR-0003](https://github.com/smonn/ids/blob/main/docs/adr/0003-canonical-strict-is.md)), but `safeParse` is a safe boundary for stale non-canonical values. An unrecognised value throws at read time so corrupt data surfaces immediately.

## Error handling

The read path throws `IdsError` with code `"invalid_id"` when the stored value does not parse
as a valid `Id<Brand>`. The underlying `ParseError` is attached as `err.cause`. Catch and
narrow using `isIdsError`:

```ts
import { idColumn, isIdsError } from "@smonn/ids/drizzle";

try {
  // query that triggers a read through idColumn / idColumnMysql / idColumnSqlite
} catch (err) {
  if (isIdsError(err) && err.code === "invalid_id") {
    // err.cause is the ParseError returned by safeParse
  }
}
```

`IdsError`, `isIdsError`, and `IdsErrorCode` are re-exported from `@smonn/ids/drizzle` — no
separate import from `"@smonn/ids"` is needed. For the full list of `IdsErrorCode` values, see
the error-code reference.
