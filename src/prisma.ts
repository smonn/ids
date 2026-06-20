import { IdsError, isIdsError, type IdsErrorCode } from "./error.js";
import type { Id, ParseResult } from "./types.js";

/** {@link IdsError} class, {@link isIdsError} type guard, and {@link IdsErrorCode} union — re-exported from `"@smonn/ids"` for convenience. */
export { IdsError, isIdsError, type IdsErrorCode };

/**
 * Minimum codec interface required by the Prisma adapter.
 *
 * Any codec variant satisfies this type — TimestampCodec, OpaqueTimestampCodec,
 * ReverseTimestampCodec, and WrappedKeyCodec all expose `safeParse`. The adapter
 * never calls key-dependent methods.
 *
 * Intentionally the same structural shape as the Drizzle adapter's IdColumnCodec.
 * Do NOT import IdColumnCodec from `@smonn/ids/drizzle` — that would create
 * cross-adapter coupling.
 */
export type IdColumnCodec<Brand extends string> = {
  safeParse(value: unknown): ParseResult<Brand>;
};

/**
 * Read/write transform pair for integrating `Id<Brand>` with Prisma extensions.
 *
 * **Prisma casting caveat:** Prisma cannot fully brand a generated model field
 * type at the schema level. The `read` function asserts `Id<Brand>` at the
 * TypeScript level, but Prisma's generated types for the model field will not
 * reflect this branding. Callers consuming the validated value from a Prisma
 * result component may need an explicit `as Id<Brand>` cast at the call site.
 */
export type IdTransform<Brand extends string> = {
  /**
   * Read transform: validates the raw database value via `safeParse` and returns
   * `Id<Brand>`. Throws if the value is missing, malformed, or belongs to a
   * different brand.
   *
   * Use in a Prisma `$extends` result component's `compute` function.
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
};

/**
 * Creates a read/write transform pair for use with Prisma's `$extends` extension model.
 *
 * Works with any codec variant exposing `safeParse` (TimestampCodec,
 * OpaqueTimestampCodec, ReverseTimestampCodec, WrappedKeyCodec).
 *
 * **Prisma casting caveat:** Prisma's `$extends` result component can add
 * typed computed accessors to model instances, but cannot retroactively
 * re-type an existing schema field at the Prisma Client level. The `read`
 * function asserts `Id<Brand>`, but callers will need an explicit
 * `as Id<Brand>` cast at consumption sites where Prisma's generated types
 * are expected.
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
 *     user: {
 *       id: {
 *         needs: { id: true },
 *         compute(user) {
 *           // Cast required: Prisma cannot brand the generated type at schema level
 *           return userIdField.read(user.id) as Id<"usr">;
 *         },
 *       },
 *     },
 *   },
 * });
 * ```
 */
export function idField<Brand extends string>(codec: IdColumnCodec<Brand>): IdTransform<Brand> {
  return {
    read(value: unknown): Id<Brand> {
      const result = codec.safeParse(value);
      if (!result.ok) {
        throw new IdsError("invalid_id", `invalid ID from database: ${result.error}`, {
          cause: result.error,
        });
      }
      return result.id;
    },
    write(value: Id<Brand>): string {
      return value;
    },
  };
}
