import type {
  ColumnType,
  KyselyPlugin,
  PluginTransformQueryArgs,
  PluginTransformResultArgs,
  QueryResult,
  UnknownRow,
} from "kysely";
import {
  readIdColumn,
  readIdColumnNullable,
  writeIdColumn,
  writeIdColumnNullable,
  type IdColumnCodec,
  type IdGeneratingCodec,
} from "./adapter-types.js";
import type { Id } from "../types.js";

export type { IdColumnCodec, IdGeneratingCodec } from "./adapter-types.js";
/** {@link IdsError} class, {@link isIdsError} type guard, and {@link IdsErrorCode} union — re-exported from `"@smonn/ids"` for convenience. */
export { IdsError, isIdsError, type IdsErrorCode } from "../error.js";

/**
 * Kysely column type mapping for `Id<Brand>`.
 *
 * Use this in your Kysely `Database` interface to type a column as `Id<Brand>` at
 * the TypeScript level. Pair it with `idColumn(codec)` for runtime read/write
 * transformation.
 *
 * @example
 * ```ts
 * import type { IdColumnType } from "@smonn/ids/kysely";
 * import type { Id } from "@smonn/ids";
 *
 * interface Database {
 *   users: { id: IdColumnType<"usr"> };
 * }
 * ```
 */
export type IdColumnType<Brand extends string> = ColumnType<Id<Brand>, Id<Brand>, Id<Brand>>;

/**
 * Kysely column type mapping for a nullable `Id<Brand>` column.
 *
 * Use in your Kysely `Database` interface for optional foreign keys or any
 * column that can be `NULL`. Pair with `nullableIdColumn(codec)` for runtime
 * transformation.
 *
 * @example
 * ```ts
 * import type { NullableIdColumnType } from "@smonn/ids/kysely";
 * import type { Id } from "@smonn/ids";
 *
 * interface Database {
 *   posts: { authorId: NullableIdColumnType<"usr"> };
 * }
 * ```
 */
export type NullableIdColumnType<Brand extends string> = ColumnType<
  Id<Brand> | null,
  Id<Brand> | null,
  Id<Brand> | null
>;

/**
 * Kysely column adapter bound to a codec.
 *
 * Returns an object with `fromDriver` / `toDriver` helpers that mirror the read/write
 * contract of the Drizzle adapter — same error message, same strictness (safeParse on
 * read and write).
 *
 * **Write path:** validates the value via `codec.safeParse` and throws
 * `IdsError("invalid_id")` if validation fails.
 *
 * **Read path:** normalises the raw DB string via `codec.safeParse()`. Throws if
 * the value does not parse as a valid `Id<Brand>`.
 *
 * @example
 * ```ts
 * import { idColumn } from "@smonn/ids/kysely";
 * import { createTimestampId } from "@smonn/ids";
 *
 * const usr = createTimestampId("usr");
 * const usrCol = idColumn(usr);
 *
 * // In a query result handler:
 * const id = usrCol.fromDriver(row.id);
 * ```
 */
export function idColumn<Brand extends string>(
  codec: IdColumnCodec<Brand>,
): {
  toDriver(value: Id<Brand>): string;
  fromDriver(value: string): Id<Brand>;
} {
  return {
    toDriver(value: Id<Brand>): string {
      return writeIdColumn(codec, value);
    },
    fromDriver(value: string): Id<Brand> {
      return readIdColumn(codec, value);
    },
  };
}

/**
 * Generates a fresh `Id<Brand>` for use at a Kysely insert call site.
 *
 * Requires a codec variant that exposes a synchronous `generate()` — see
 * {@link IdGeneratingCodec}. Only the **Timestamp codec** and **Reverse
 * Timestamp codec** qualify; Opaque, Signed, Wrapped, and Digest codecs
 * are rejected at compile time.
 *
 * @example
 * ```ts
 * import { insertId } from "@smonn/ids/kysely";
 * import { createTimestampId } from "@smonn/ids";
 *
 * const usr = createTimestampId("usr");
 *
 * await db.insertInto("users").values({ id: insertId(usr), name: "Alice" }).execute();
 * ```
 */
export function insertId<Brand extends string>(codec: IdGeneratingCodec<Brand>): Id<Brand> {
  return codec.generate();
}

/**
 * Kysely plugin that automatically transforms result columns using the provided codec map.
 *
 * **Unbranded map — callers own the key-to-column mapping.** The `map` parameter is typed as
 * `Record<string, IdColumnCodec<string>>` with no schema-level brand parameter. There is no
 * compile-time guarantee that map keys correspond to actual columns in your `Database` interface;
 * a misspelled or stale key silently matches nothing, and the column is left un-transformed.
 * Callers are responsible for keeping the map in sync with their schema.
 *
 * **Keys must be bare column names** (e.g. `"id"`, `"user_id"`). Qualified keys containing a
 * dot (e.g. `"users.id"`) are **not** supported — passing one throws a synchronous `Error` at
 * construction time, naming the offending key. Per-table disambiguation is not implemented.
 *
 * `transformResult` calls `readIdColumn(codec, rawValue)` for each matched column, returning
 * a branded `Id<Brand>` on success and throwing `IdsError("invalid_id")` on parse failure.
 * `transformQuery` is a no-op identity pass-through.
 *
 * @example
 * ```ts
 * import { idPlugin } from "@smonn/ids/kysely";
 * import { createTimestampId } from "@smonn/ids";
 * import { Kysely } from "kysely";
 *
 * const usr = createTimestampId("usr");
 *
 * const db = new Kysely<Database>({
 *   // ...
 *   plugins: [idPlugin({ id: usr })],
 * });
 *
 * // result.id is automatically validated and branded as Id<"usr">
 * const row = await db.selectFrom("users").selectAll().executeTakeFirstOrThrow();
 * ```
 */
export function idPlugin(map: Record<string, IdColumnCodec<string>>): KyselyPlugin {
  for (const key of Object.keys(map)) {
    if (key.includes(".")) {
      throw new Error(
        `idPlugin: map keys must be bare column names, but "${key}" contains a dot. ` +
          `Per-table qualified keys are not supported — use a bare column name instead.`,
      );
    }
  }
  const lookup = new Map<string, IdColumnCodec<string>>(Object.entries(map));

  return {
    transformQuery(args: PluginTransformQueryArgs) {
      return args.node;
    },
    async transformResult(args: PluginTransformResultArgs): Promise<QueryResult<UnknownRow>> {
      const { rows } = args.result;
      const firstRow = rows[0];
      if (firstRow === undefined) {
        return args.result;
      }
      // Precompute: find which ID columns actually appear in this result set.
      const idCols: Array<[string, IdColumnCodec<string>]> = [];
      for (const key of Object.keys(firstRow)) {
        const codec = lookup.get(key);
        if (codec !== undefined) {
          idCols.push([key, codec]);
        }
      }
      if (idCols.length === 0) {
        return args.result;
      }
      const newRows = rows.map((row) => {
        const newRow = { ...row };
        for (const [colName, codec] of idCols) {
          newRow[colName] = readIdColumn(codec, row[colName]);
        }
        return newRow;
      });
      return { ...args.result, rows: newRows };
    },
  };
}

/**
 * Kysely column adapter for a **nullable** `Id<Brand>` column.
 *
 * Behaves like {@link idColumn} but `fromDriver` returns `null` for `null` /
 * `undefined` driver values and `toDriver` passes `null` through unchanged.
 * Use for optional foreign keys and `LEFT JOIN` results.
 *
 * @example
 * ```ts
 * import { nullableIdColumn } from "@smonn/ids/kysely";
 * import { createTimestampId } from "@smonn/ids";
 *
 * const usr = createTimestampId("usr");
 * const authorCol = nullableIdColumn(usr);
 *
 * // In a query result handler:
 * const authorId = authorCol.fromDriver(row.author_id); // Id<"usr"> | null
 * ```
 */
export function nullableIdColumn<Brand extends string>(
  codec: IdColumnCodec<Brand>,
): {
  toDriver(value: Id<Brand> | null | undefined): string | null;
  fromDriver(value: string | null): Id<Brand> | null;
} {
  return {
    toDriver(value: Id<Brand> | null | undefined): string | null {
      return writeIdColumnNullable(codec, value);
    },
    fromDriver(value: string | null): Id<Brand> | null {
      return readIdColumnNullable(codec, value);
    },
  };
}
