import type { ValueTransformer } from "typeorm";
import { IdsError, isIdsError, type IdsErrorCode } from "../error.js";
import { readIdColumn, type IdColumnCodec } from "./adapter-types.js";
import type { Id, ValidBrand } from "../types.js";

/** {@link IdsError} class, {@link isIdsError} type guard, and {@link IdsErrorCode} union — re-exported from `"@smonn/ids"` for convenience. */
export { IdsError, isIdsError, type IdsErrorCode };

export type { IdColumnCodec };

/**
 * TypeORM column transformer for `Id<Brand>`.
 *
 * Returns a `ValueTransformer` object suitable for use in a TypeORM `@Column`
 * decorator's `transformer` option.
 *
 * **Write path (`to`):** passes the `Id<Brand>` directly to the database — it is
 * already the canonical string form.
 *
 * **Read path (`from`):** normalises the raw database value via `codec.safeParse()`.
 * Throws `IdsError` with code `"invalid_id"` if the value does not parse as a valid
 * `Id<Brand>`.
 *
 * **TypeORM branding caveat:** TypeORM cannot brand a generated entity field type at
 * the schema level. Annotate the entity field explicitly: `id!: Id<"usr">`.
 *
 * @example
 * ```ts
 * import { idTransformer } from "@smonn/ids/typeorm";
 * import { createTimestampId } from "@smonn/ids";
 * import type { Id } from "@smonn/ids";
 * import { Column, Entity } from "typeorm";
 *
 * const usr = createTimestampId("usr");
 *
 * @Entity()
 * class User {
 *   @Column({ type: "text", transformer: idTransformer(usr) })
 *   id!: Id<"usr">;
 * }
 * ```
 */
export function idTransformer<Brand extends ValidBrand>(
  codec: IdColumnCodec<Brand>,
): ValueTransformer {
  return {
    to(value: Id<Brand>): string {
      return value;
    },
    from(value: unknown): Id<Brand> {
      return readIdColumn(codec, value);
    },
  };
}
