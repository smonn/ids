import { IdsError, isIdsError, type IdsErrorCode } from "../error.js";
import { readIdColumn, type IdColumnCodec } from "./adapter-types.js";
import type { Id, ValidBrand } from "../types.js";

/** {@link IdsError} class, {@link isIdsError} type guard, and {@link IdsErrorCode} union — re-exported from `"@smonn/ids"` for convenience. */
export { IdsError, isIdsError, type IdsErrorCode };

export type { IdColumnCodec };

/**
 * Read/write transform pair and `$extends` result-component factory for
 * integrating `Id<Brand>` with Prisma extensions.
 */
export type IdTransform<Brand extends ValidBrand> = {
  /**
   * Read transform: validates the raw database value via `safeParse` and returns
   * `Id<Brand>`. Throws if the value is missing, malformed, or belongs to a
   * different brand.
   */
  read(value: unknown): Id<Brand>;
  /**
   * Write transform: passes `Id<Brand>` through as its canonical string form.
   * `Id<Brand>` is already the canonical string, so this is an identity function
   * at runtime.
   *
   * Use in a Prisma `$extends` query component or explicit `data` mapping.
   */
  write(value: Id<Brand>): string;
  /**
   * Creates a typed `$extends` result-component field definition that carries
   * `Id<Brand>` through Prisma's type machinery without a per-call-site cast.
   *
   * @param fieldName - The model field to read from (e.g. `"id"`).
   * @returns A `{ needs, compute }` object whose `compute` return type is
   * statically `Id<Brand>`, so the extended-client model field is typed correctly.
   *
   * @example
   * ```ts
   * const xprisma = prisma.$extends({
   *   result: {
   *     user: { id: userIdField.computeField("id") },
   *   },
   * });
   * // xprisma.user.findUnique(…).id is typed as Id<"usr"> — no cast required
   * ```
   */
  computeField(fieldName: string): {
    needs: Record<string, boolean>;
    compute: (model: Record<string, unknown>) => Id<Brand>;
  };
};

/**
 * Creates a read/write transform pair for use with Prisma's `$extends` extension model.
 *
 * Works with any codec variant exposing `safeParse`.
 *
 * Use `computeField(fieldName)` to produce a typed `$extends` result-component
 * field definition — the brand is carried through Prisma's type machinery
 * automatically and no per-call-site cast is required.
 *
 * @example
 * ```ts
 * import { idField } from "@smonn/ids/prisma";
 * import { createTimestampId } from "@smonn/ids";
 *
 * const usr = createTimestampId("usr");
 * const userIdField = idField(usr);
 *
 * const xprisma = prisma.$extends({
 *   result: {
 *     user: { id: userIdField.computeField("id") },
 *   },
 * });
 * // xprisma.user.findUnique(…).id is typed as Id<"usr"> — no cast required
 * ```
 */
export function idField<Brand extends ValidBrand>(codec: IdColumnCodec<Brand>): IdTransform<Brand> {
  return {
    read(value: unknown): Id<Brand> {
      return readIdColumn(codec, value);
    },
    write(value: Id<Brand>): string {
      return value;
    },
    computeField(fieldName: string) {
      return {
        needs: { [fieldName]: true },
        // Prisma's $extends types `compute` as returning `any` in its constraint
        // type (DynamicResultExtensionArgs). Returning a pre-built object with an
        // explicit Id<Brand> return type on `compute` causes TypeScript to infer
        // the brand through the `& R` intersection in $extends — encapsulating
        // the single necessary cast here rather than pushing it to every call site.
        compute: (model: Record<string, unknown>): Id<Brand> =>
          readIdColumn(codec, model[fieldName]),
      };
    },
  };
}
