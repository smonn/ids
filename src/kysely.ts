import type { ColumnType } from "kysely";
import { IdsError, isIdsError, type IdsErrorCode } from "./error.js";
import type { IdColumnCodec } from "./drizzle.js";
import type { Id } from "./types.js";

export type { IdColumnCodec } from "./drizzle.js";
export { IdsError, isIdsError, type IdsErrorCode };

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
      const result = codec.safeParse(value);
      if (!result.ok) {
        throw new IdsError("invalid_id", `invalid ID from database: ${result.error}`, {
          cause: result.error,
        });
      }
      return result.id;
    },
  };
}
