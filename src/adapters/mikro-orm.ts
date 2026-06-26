import { Type } from "@mikro-orm/core";
import { readIdColumn, type IdColumnCodec } from "./adapter-types.js";
import type { Id } from "../types.js";

/** {@link IdsError} class, {@link isIdsError} type guard, and {@link IdsErrorCode} union — re-exported from `"@smonn/ids"` for convenience. */
export { IdsError, isIdsError, type IdsErrorCode } from "../error.js";

export type { IdColumnCodec };

/**
 * Factory that returns a MikroORM `Type` subclass bound to a codec.
 *
 * **Write path** (`convertToDatabaseValue`): passes the `Id<Brand>` through
 * unchanged — it is already the canonical string form.
 *
 * **Read path** (`convertToJSValue`): normalises the raw DB value via
 * `codec.safeParse()`. Throws `IdsError("invalid_id")` if the stored value
 * does not parse as a valid `Id<Brand>`.
 *
 * **Column type** (`getColumnType`): returns `"text"` by default, or the
 * `options.columnType` override when provided.
 *
 * @param codec - The brand-scoped codec used to parse values read from the database.
 * @param options - Optional column configuration.
 * @param options.columnType - SQL column type to use (default: `"text"`). Pass
 *   `"varchar(30)"` or `"char(26)"` to match an existing DDL or index strategy.
 *   The value is passed through verbatim — no validation is performed.
 *
 * @example
 * ```ts
 * import { PrimaryKey } from "@mikro-orm/core";
 * import { idType } from "@smonn/ids/mikro-orm";
 * import { createTimestampId } from "@smonn/ids";
 * import type { Id } from "@smonn/ids";
 *
 * const usr = createTimestampId("usr");
 *
 * // default: text column
 * class User {
 *   @PrimaryKey({ type: idType(usr) })
 *   id!: Id<"usr">;
 * }
 *
 * // explicit varchar column
 * class Org {
 *   @PrimaryKey({ type: idType(usr, { columnType: "varchar(30)" }) })
 *   id!: Id<"usr">;
 * }
 * ```
 */
export function idType<Brand extends string>(
  codec: IdColumnCodec<Brand>,
  options?: { columnType?: string },
): new () => Type<Id<Brand>, string> {
  const columnType = options?.columnType ?? "text";
  return class extends Type<Id<Brand>, string> {
    override convertToDatabaseValue(value: Id<Brand>): string {
      return value;
    }
    override convertToJSValue(value: string): Id<Brand> {
      return readIdColumn(codec, value);
    }
    override getColumnType(): string {
      return columnType;
    }
  };
}
