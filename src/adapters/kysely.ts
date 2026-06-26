import type { ColumnType } from "kysely";
import { readIdColumn, readIdColumnNullable, type IdColumnCodec } from "./adapter-types.js";
import type { Id } from "../types.js";

export type { IdColumnCodec } from "./adapter-types.js";
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
 * read, identity on write).
 *
 * **Write path:** passes the `Id<Brand>` directly to the driver — it is already
 * the canonical string form.
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
      return value;
    },
    fromDriver(value: string): Id<Brand> {
      return readIdColumn(codec, value);
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
  toDriver(value: Id<Brand> | null): string | null;
  fromDriver(value: string | null): Id<Brand> | null;
} {
  return {
    toDriver(value: Id<Brand> | null): string | null {
      return value;
    },
    fromDriver(value: string | null): Id<Brand> | null {
      return readIdColumnNullable(codec, value);
    },
  };
}
