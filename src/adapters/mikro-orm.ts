import { Type } from "@mikro-orm/core";
import { readIdColumn, readIdColumnNullable, type IdColumnCodec } from "./adapter-types.js";
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
 * **Column type** (`getColumnType`): returns `"text"`.
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
 * class User {
 *   @PrimaryKey({ type: idType(usr) })
 *   id!: Id<"usr">;
 * }
 * ```
 */
export function idType<Brand extends string>(
  codec: IdColumnCodec<Brand>,
): new () => Type<Id<Brand>, string> {
  return class extends Type<Id<Brand>, string> {
    override convertToDatabaseValue(value: Id<Brand>): string {
      return value;
    }
    override convertToJSValue(value: string): Id<Brand> {
      return readIdColumn(codec, value);
    }
    override getColumnType(): string {
      return "text";
    }
  };
}

/**
 * Factory that returns a MikroORM `Type` subclass for a **nullable** `Id<Brand>` column.
 *
 * Behaves like {@link idType} but `convertToJSValue` returns `null` for `null` /
 * `undefined` database values and `convertToDatabaseValue` passes `null` through
 * unchanged. Use for optional foreign keys.
 *
 * @example
 * ```ts
 * import { Property } from "@mikro-orm/core";
 * import { nullableIdType } from "@smonn/ids/mikro-orm";
 * import { createTimestampId } from "@smonn/ids";
 * import type { Id } from "@smonn/ids";
 *
 * const usr = createTimestampId("usr");
 *
 * class Post {
 *   @Property({ type: nullableIdType(usr), nullable: true })
 *   authorId!: Id<"usr"> | null;
 * }
 * ```
 */
export function nullableIdType<Brand extends string>(
  codec: IdColumnCodec<Brand>,
): new () => Type<Id<Brand> | null, string | null> {
  return class extends Type<Id<Brand> | null, string | null> {
    override convertToDatabaseValue(value: Id<Brand> | null): string | null {
      return value;
    }
    override convertToJSValue(value: string | null): Id<Brand> | null {
      return readIdColumnNullable(codec, value);
    }
    override getColumnType(): string {
      return "text";
    }
  };
}
