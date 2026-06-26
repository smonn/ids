import {
  customType,
  type ConvertCustomConfig,
  type PgCustomColumnBuilder,
} from "drizzle-orm/pg-core";
import { readIdColumn, type IdColumnCodec } from "./adapter-types.js";
import type { Id } from "../types.js";

/** {@link IdsError} class, {@link isIdsError} type guard, and {@link IdsErrorCode} union — re-exported from `"@smonn/ids"` for convenience. */
export { IdsError, isIdsError, type IdsErrorCode } from "../error.js";

export type { IdColumnCodec };

/**
 * Drizzle custom column type that stores an `Id<Brand>` as a canonical SQL string value.
 *
 * **Write path:** passes the `Id<Brand>` directly to the driver — it is already
 * the canonical string form.
 *
 * **Read path:** normalises the raw DB string via `codec.safeParse()`, not strict
 * `is()`. Data at rest should already be canonical per ADR-0003, but `safeParse`
 * is a safe boundary in case stale non-canonical values exist. Throws if the
 * value from the database does not parse as a valid `Id<Brand>`.
 *
 * @param codec - The brand-scoped codec used to parse values read from the database.
 * @param options - Optional column configuration.
 * @param options.columnType - SQL column type to use (default: `"text"`). Pass
 *   `"varchar(30)"` or `"char(26)"` to match an existing DDL or index strategy.
 *   The value is passed through verbatim — no validation is performed.
 *
 * @example
 * ```ts
 * import { idColumn } from "@smonn/ids/drizzle";
 * import { createTimestampId } from "@smonn/ids";
 *
 * const usr = createTimestampId("usr");
 * // default: text column
 * export const users = pgTable("users", { id: idColumn(usr).primaryKey() });
 * // explicit varchar column
 * export const orgs = pgTable("orgs", { id: idColumn(usr, { columnType: "varchar(30)" }).primaryKey() });
 * ```
 */
export function idColumn<Brand extends string>(
  codec: IdColumnCodec<Brand>,
  options?: { columnType?: string },
): PgCustomColumnBuilder<ConvertCustomConfig<"", { data: Id<Brand>; driverData: string }>> {
  const columnType = options?.columnType ?? "text";
  return customType<{ data: Id<Brand>; driverData: string }>({
    dataType() {
      return columnType;
    },
    toDriver(value: Id<Brand>): string {
      return value;
    },
    fromDriver(value: string): Id<Brand> {
      return readIdColumn(codec, value);
    },
  })();
}
