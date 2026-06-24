import { Type } from "@mikro-orm/core";
import { IdsError, isIdsError, type IdsErrorCode } from "../error.js";
import { readIdColumn, type IdColumnCodec } from "./adapter-types.js";
import type { Id } from "../types.js";

/** {@link IdsError} class, {@link isIdsError} type guard, and {@link IdsErrorCode} union — re-exported from `"@smonn/ids"` for convenience. */
export { IdsError, isIdsError, type IdsErrorCode };

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
 * import { Property } from "@mikro-orm/core";
 * import { idType } from "@smonn/ids/mikro-orm";
 * import { createTimestampId } from "@smonn/ids";
 * import type { Id } from "@smonn/ids";
 *
 * const usr = createTimestampId("usr");
 *
 * class User {
 *   @Property({ type: idType(usr) })
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
