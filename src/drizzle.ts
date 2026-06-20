import {
  customType,
  type ConvertCustomConfig,
  type PgCustomColumnBuilder,
} from "drizzle-orm/pg-core";
import { IdsError, isIdsError, type IdsErrorCode } from "./error.js";
import type { Id, ParseResult } from "./types.js";

export { IdsError, isIdsError, type IdsErrorCode };

/**
 * Minimum codec interface required by the Drizzle adapter.
 *
 * Any codec variant satisfies this type — TimestampCodec, OpaqueTimestampCodec,
 * and WrappedKeyCodec all expose `safeParse`. The adapter never calls
 * `extractTimestamp`, `wrap`/`unwrap`, or any key-dependent method.
 *
 * Kysely and Prisma adapter issues should use this same codec contract shape.
 */
export type IdColumnCodec<Brand extends string> = {
  safeParse(value: unknown): ParseResult<Brand>;
};

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
      const result = codec.safeParse(value);
      if (!result.ok) {
        throw new IdsError("invalid_id", `invalid ID from database: ${result.error}`, {
          cause: result.error,
        });
      }
      return result.id;
    },
  })();
}
