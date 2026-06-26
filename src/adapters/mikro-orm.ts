import { Type } from "@mikro-orm/core";
import { readIdColumn, readIdColumnNullable, type IdColumnCodec } from "./adapter-types.js";
import type { Id } from "../types.js";

/** {@link IdsError} class, {@link isIdsError} type guard, and {@link IdsErrorCode} union — re-exported from `"@smonn/ids"` for convenience. */
export { IdsError, isIdsError, type IdsErrorCode } from "../error.js";

export type { IdColumnCodec };

/**
 * Extension of {@link IdColumnCodec} that also exposes synchronous `generate()`.
 * Required by {@link idField} so that the MikroORM `onCreate` hook can produce
 * IDs at persist time. Only the **Timestamp codec** and **Reverse Timestamp codec**
 * satisfy this; async-generate codecs (Opaque, Signed, Wrapped, Digest) do not.
 */
export type IdGeneratingCodec<Brand extends string> = IdColumnCodec<Brand> & {
  generate(): Id<Brand>;
};

/**
 * Returns a MikroORM property option object that wires `codec.generate()` into the
 * `onCreate` lifecycle hook, so the field auto-fills on first persist.
 *
 * Requires a codec variant that exposes a synchronous `generate()` —
 * see {@link IdGeneratingCodec}. Only the **Timestamp codec** and **Reverse
 * Timestamp codec** qualify; Opaque, Signed, Wrapped, and Digest codecs cannot
 * be passed here.
 *
 * Spread the result into a `@Property()` decorator options object:
 *
 * @example
 * ```ts
 * import { PrimaryKey } from "@mikro-orm/core";
 * import { idField } from "@smonn/ids/mikro-orm";
 * import { createTimestampId } from "@smonn/ids";
 * import type { Id } from "@smonn/ids";
 *
 * const usr = createTimestampId("usr");
 *
 * class User {
 *   @PrimaryKey(idField(usr))
 *   id!: Id<"usr">;
 * }
 * ```
 */
export function idField<Brand extends string>(
  codec: IdGeneratingCodec<Brand>,
): {
  type: new () => Type<Id<Brand>, string>;
  onCreate: () => Id<Brand>;
} {
  return {
    type: idType(codec),
    onCreate: () => codec.generate(),
  };
}

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
