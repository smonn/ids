---
title: Kysely adapter
description: A Kysely plugin and column adapter for @smonn/ids codecs.
---

`@smonn/ids/kysely` provides a Kysely plugin and column adapter bound to a codec. It requires `kysely` as an **optional peer dependency**.

```bash
pnpm add kysely
```

## Recommended: `idPlugin`

`idPlugin(map)` is the recommended integration path. It installs on a `Kysely` instance and automatically runs `fromDriver` on every configured column across all query results — no per-call-site work required.

```ts
import { idPlugin } from "@smonn/ids/kysely";
import { createTimestampId } from "@smonn/ids";
import { Kysely } from "kysely";

const usr = createTimestampId("usr");
const org = createTimestampId("org");

interface Database {
  users: { id: string; name: string };
  posts: { id: string; org_id: string };
}

const db = new Kysely<Database>({
  // ...dialect...
  plugins: [
    idPlugin({
      "users.id": usr,
      "posts.id": usr,
      "posts.org_id": org,
    }),
  ],
});

// id is automatically validated and branded — no fromDriver() call needed
const row = await db.selectFrom("users").selectAll().executeTakeFirstOrThrow();
```

### Column map keys

Keys in the map are plain column names (`"id"`) or `"table.column"` qualified names (`"users.id"`):

- A plain name like `"id"` matches any result column with that name, regardless of which table it came from.
- A qualified name like `"users.id"` also matches by the column-name part (`"id"`), and takes precedence over a plain key for the same column name.

Matching is done against column names as they appear in the raw result row — no query-AST alias resolution.

### Error handling

`transformResult` calls `readIdColumn(codec, rawValue)` for each matched column. An invalid value throws `IdsError` with code `"invalid_id"` and the underlying `ParseError` on `.cause`, consistent with `idColumn`'s `fromDriver`:

```ts
import { idPlugin, isIdsError } from "@smonn/ids/kysely";

const db = new Kysely<Database>({
  plugins: [idPlugin({ "users.id": usr })],
});

// throws IdsError("invalid_id") at read time if the stored value is corrupt
const row = await db.selectFrom("users").selectAll().executeTakeFirstOrThrow();
```

## Low-level alternative: `idColumn`

`idColumn(codec)` returns a bare `{ toDriver, fromDriver }` object for callers who prefer manual control. Unlike `idPlugin`, you must call `fromDriver` yourself on every query result.

```ts
import { idColumn, type IdColumnType } from "@smonn/ids/kysely";
import { createTimestampId } from "@smonn/ids";

const usr = createTimestampId("usr");
const usrCol = idColumn(usr);

interface Database {
  users: { id: IdColumnType<"usr"> };
}

// Kysely has no runtime transformer — fromDriver does NOT fire automatically.
// Call it manually on every read result. The `as unknown as string` cast is
// required because TypeScript already sees row.id as Id<"usr"> (from the
// Database interface), even though the raw DB value is a plain string at runtime.
const row = await db.selectFrom("users").selectAll().executeTakeFirstOrThrow();
const id = usrCol.fromDriver(row.id as unknown as string);
```

`idColumn(codec)` works with any codec variant.

- **Write path:** `toDriver` passes the already-canonical `Id<Brand>` unchanged. Passing `null` or `undefined` throws `IdsError("invalid_id")` at runtime — use `nullableIdColumn` for nullable columns.
- **Read path:** `fromDriver` normalises the raw DB string via `codec.safeParse()`. An unrecognised value throws at read time so corrupt data surfaces immediately.

### Error handling

`fromDriver` throws `IdsError` with code `"invalid_id"` when the stored value does not parse as a valid `Id<Brand>`. The underlying `ParseError` is attached as `err.cause`. Catch and narrow using `isIdsError`:

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

`IdsError`, `isIdsError`, and `IdsErrorCode` are re-exported from `@smonn/ids/kysely` — no separate import from `"@smonn/ids"` is needed. For the full list of `IdsErrorCode` values, see the error-code reference.

## Generating IDs at the insert call site — `insertId`

Kysely has no built-in column-level default hook, so ID generation is explicit at the insert call site. The `insertId(codec)` helper generates a fresh `Id<Brand>` and returns it so you can capture the value for use after the insert:

```ts
import { insertId } from "@smonn/ids/kysely";
import { createTimestampId } from "@smonn/ids";

const usr = createTimestampId("usr");

const id = insertId(usr);
await db.insertInto("users").values({ id, name: "Alice" }).execute();
// id is the generated Id<"usr">, available for further use
```

`insertId` requires `IdGeneratingCodec` — a codec that exposes a synchronous `generate()`. Only the **Timestamp codec** and **Reverse Timestamp codec** qualify; Opaque, Signed, Wrapped, and Digest codecs are a compile-time error. There is no runtime default in Kysely — generation is always explicit at the insert call site.

## Nullable columns

`nullableIdColumn(codec)` returns a `{ toDriver, fromDriver }` pair where `fromDriver` returns `null` for `null` / `undefined` driver values instead of throwing. Use it for optional foreign keys and `LEFT JOIN` results.

Pair it with `NullableIdColumnType<Brand>` in your `Database` interface:

```ts
import { nullableIdColumn, type IdColumnType, type NullableIdColumnType } from "@smonn/ids/kysely";
import { createTimestampId } from "@smonn/ids";

const usr = createTimestampId("usr");
const authorCol = nullableIdColumn(usr);

interface Database {
  posts: {
    id: IdColumnType<"pst">;
    author_id: NullableIdColumnType<"usr">;
  };
}

const row = await db.selectFrom("posts").selectAll().executeTakeFirstOrThrow();
// row.author_id is Id<"usr"> | null from the TypeScript type, but the raw DB value
// is a plain string or null at runtime — call fromDriver manually:
const authorId = authorCol.fromDriver(row.author_id as unknown as string | null);
// authorId is Id<"usr"> | null
```

- **Read path:** `fromDriver` returns `null` for `null` / `undefined` driver values. Non-null values are normalised via `codec.safeParse()` and throw `IdsError("invalid_id")` if they do not parse as a valid `Id<Brand>`.
- **Write path:** `toDriver` normalises `null` and `undefined` to `null`; `Id<Brand>` values are passed through as canonical strings.

### `idPlugin` and nullable columns

`idPlugin` does **not** automatically handle nullable columns. When a column in the plugin's map contains a `null` value (for example from a `LEFT JOIN`), the plugin calls the non-nullable `fromDriver` path, which throws `IdsError("invalid_id")`.

If a mapped column can be `null`, use `nullableIdColumn` manually on the query result instead of relying on `idPlugin` for that column — or exclude it from the plugin map entirely and handle it at the call site.
