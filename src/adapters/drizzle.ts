import {
  customType,
  type ConvertCustomConfig,
  type PgCustomColumnBuilder,
} from "drizzle-orm/pg-core";
import { readIdColumn, readIdColumnNullable, type IdColumnCodec } from "./adapter-types.js";
import type { Id } from "../types.js";

/** {@link IdsError} class, {@link isIdsError} type guard, and {@link IdsErrorCode} union — re-exported from `"@smonn/ids"` for convenience. */
export { IdsError, isIdsError, type IdsErrorCode } from "../error.js";

export type { IdColumnCodec };

/**
 * Drizzle custom column type that stores an `Id<Brand>` as a canonical `text` value.
 *
 * **Write path:** passes the `Id<Brand>` directly to the driver — it is already
 * the canonical string form.
 *
 * **Read path:** normalises the raw DB string via `codec.safeParse()`, not strict
 * `is()`. Data at rest should already be canonical per ADR-0003, but `safeParse`
 * is a safe boundary in case stale non-canonical values exist. Throws if the
 * value from the database does not parse as a valid `Id<Brand>`.
 *
 * @example
 * ```ts
 * import { idColumn } from "@smonn/ids/drizzle";
 * import { createTimestampId } from "@smonn/ids";
 *
 * const usr = createTimestampId("usr");
 * export const users = pgTable("users", { id: idColumn(usr).primaryKey() });
 * // users.id is Id<"usr"> end-to-end
 * ```
 */
export function idColumn<Brand extends string>(
  codec: IdColumnCodec<Brand>,
): PgCustomColumnBuilder<ConvertCustomConfig<"", { data: Id<Brand>; driverData: string }>> {
  return customType<{ data: Id<Brand>; driverData: string }>({
    dataType() {
      return "text";
    },
    toDriver(value: Id<Brand>): string {
      return value;
    },
    fromDriver(value: string): Id<Brand> {
      return readIdColumn(codec, value);
    },
  })();
}

/**
 * Drizzle custom column type for a **nullable** `Id<Brand>` column.
 *
 * Behaves identically to {@link idColumn} except that `null` and `undefined`
 * driver values are passed through as `null` rather than throwing. Use for
 * optional foreign keys, `LEFT JOIN` results, and any column that is
 * legitimately absent.
 *
 * @example
 * ```ts
 * import { nullableIdColumn } from "@smonn/ids/drizzle";
 * import { createTimestampId } from "@smonn/ids";
 *
 * const usr = createTimestampId("usr");
 * export const posts = pgTable("posts", {
 *   authorId: nullableIdColumn(usr),
 * });
 * // posts.authorId is Id<"usr"> | null end-to-end
 * ```
 */
export function nullableIdColumn<Brand extends string>(
  codec: IdColumnCodec<Brand>,
): PgCustomColumnBuilder<
  ConvertCustomConfig<"", { data: Id<Brand> | null; driverData: string | null }>
> {
  return customType<{ data: Id<Brand> | null; driverData: string | null }>({
    dataType() {
      return "text";
    },
    toDriver(value: Id<Brand> | null): string | null {
      return value;
    },
    fromDriver(value: string | null): Id<Brand> | null {
      return readIdColumnNullable(codec, value);
    },
  })();
}
