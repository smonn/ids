import { IdsError } from "../error.js";
import type { Id, ParseError, ParseResult } from "../types.js";

/** Discriminated failure value passed to `onError` and emitted to the framework's error handler. */
export type IdParamFailure =
  | { readonly reason: "brand_mismatch"; readonly status: number }
  | { readonly reason: "malformed"; readonly status: number };

/** Minimum structural type required by web and ORM adapters. Any codec variant satisfies this — all expose `safeParse`. Adapters only ever call `safeParse` — never key-dependent methods like `extractTimestamp`, `wrap`, or `unwrap`. */
export type IdCodec<Brand extends string> = {
  safeParse(value: unknown): ParseResult<Brand>;
};

/** Re-exported from ORM adapter subpaths (`@smonn/ids/drizzle`, `@smonn/ids/prisma`, `@smonn/ids/kysely`) under the public name; structurally identical to {@link IdCodec}. */
export type IdColumnCodec<Brand extends string> = IdCodec<Brand>;

/**
 * Parses `value` as `Id<Brand>` via `codec.safeParse`; throws `IdsError("invalid_id")` on failure. Shared read helper for ORM adapters.
 *
 * **Message body includes the `ParseError` reason** (e.g. `"invalid ID from database: invalid_base32"`).
 * This intentionally diverges from the GraphQL adapter's coarsening posture (commit d225ba6): the ORM boundary
 * is a **server-side internal failure** (malformed data already at rest in the database), not a user-facing
 * surface. The reason string is diagnostic information for the developer or operator — it never flows to an
 * HTTP response body. The underlying `ParseError` is also preserved on `cause` for programmatic access.
 */
export function readIdColumn<Brand extends string>(
  codec: IdCodec<Brand>,
  value: unknown,
): Id<Brand> {
  const result = codec.safeParse(value);
  if (!result.ok) {
    throw new IdsError("invalid_id", `invalid ID from database: ${result.error}`, {
      cause: result.error,
    });
  }
  return result.id;
}

/** Like {@link readIdColumn} but returns `null` when `value` is `null` or `undefined`. Delegates to `readIdColumn` for all other values. */
export function readIdColumnNullable<Brand extends string>(
  codec: IdCodec<Brand>,
  value: unknown,
): Id<Brand> | null {
  if (value === null || value === undefined) {
    return null;
  }
  return readIdColumn(codec, value);
}

/** Writes `value` as a canonical ID string to the database. Throws `IdsError("invalid_id")` if `value` is `null` or `undefined` — a runtime guard that catches undefined silently propagating to the driver. Shared write helper for ORM adapters. */
export function writeIdColumn<Brand extends string>(value: Id<Brand>): string {
  if (value == null) {
    throw new IdsError("invalid_id", "invalid ID to database: value must not be null or undefined");
  }
  return value;
}

/** Like {@link writeIdColumn} but normalises `null` and `undefined` to `null`. Use for nullable foreign key columns. */
export function writeIdColumnNullable<Brand extends string>(
  value: Id<Brand> | null | undefined,
): string | null {
  return value ?? null;
}

/**
 * Maps a `ParseError` to `{ reason, status }` for web adapter failure handling.
 *
 * - `invalid_prefix` → `brand_mismatch` / default 404
 * - anything else → `malformed` / default 400
 * - `options.status[reason]` overrides the default for that reason
 */
export function resolveIdParamFailure(
  error: ParseError,
  options?: { status?: { brand_mismatch?: number; malformed?: number } },
): IdParamFailure {
  const reason = error === "invalid_prefix" ? ("brand_mismatch" as const) : ("malformed" as const);
  const defaultStatus = reason === "brand_mismatch" ? 404 : 400;
  const status = options?.status?.[reason] ?? defaultStatus;
  return { reason, status };
}
