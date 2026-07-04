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

/** Extends {@link IdCodec} with an async `safeVerify` — satisfied by the **Signed Timestamp codec** (native `safeVerify`) and the **Wrapped key codec** (a `safeVerify` alias over `safeUnwrap`; see ADR-0036). HTTP adapters accept `verify: true` only when the codec satisfies this interface (structural type check at the call site). The `safeVerify` method structurally parses `input` first, then verifies the tag; it returns `{ ok: false }` on either failure without throwing. */
export type IdVerifiableCodec<Brand extends string> = IdCodec<Brand> & {
  safeVerify(input: unknown): Promise<{ ok: true; id: Id<Brand> } | { ok: false; error: unknown }>;
};

/** Re-exported from ORM adapter subpaths (`@smonn/ids/drizzle`, `@smonn/ids/prisma`, `@smonn/ids/kysely`) under the public name; structurally identical to {@link IdCodec}. */
export type IdColumnCodec<Brand extends string> = IdCodec<Brand>;

/** Structural interface required by `idField()` (Prisma, MikroORM), the `generatedIdColumn` family (Drizzle), `insertId` (Kysely), and `beforeInsertHook` (TypeORM) — extends {@link IdColumnCodec} with a synchronous `generate()`. Only the **Timestamp codec** and **Reverse Timestamp codec** satisfy this; async-generate codecs (Opaque, Signed, Wrapped, Digest) do not. Re-exported from all five ORM adapter subpaths (`@smonn/ids/drizzle`, `@smonn/ids/kysely`, `@smonn/ids/mikro-orm`, `@smonn/ids/prisma`, `@smonn/ids/typeorm`) as a public type. */
export type IdGeneratingCodec<Brand extends string> = IdColumnCodec<Brand> & {
  generate(): Id<Brand>;
};

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

/** Validates `value` via `codec.safeParse` and returns it as a canonical ID string. Throws `IdsError("invalid_id")` on any failure — including null, undefined, or a cast-smuggled arbitrary string — so invalid values are rejected at the write site rather than stored. Shared write helper for ORM adapters. */
export function writeIdColumn<Brand extends string>(
  codec: IdCodec<Brand>,
  value: Id<Brand>,
): string {
  const result = codec.safeParse(value);
  if (!result.ok) {
    throw new IdsError("invalid_id", `invalid ID to database: ${result.error}`, {
      cause: result.error,
    });
  }
  return result.id;
}

/** Like {@link writeIdColumn} but returns `null` for `null` or `undefined`. Delegates to `writeIdColumn(codec, value)` for all other values. Use for nullable foreign key columns. */
export function writeIdColumnNullable<Brand extends string>(
  codec: IdCodec<Brand>,
  value: Id<Brand> | null | undefined,
): string | null {
  if (value == null) {
    return null;
  }
  return writeIdColumn(codec, value);
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

/**
 * Maps a `safeVerify` failure to `{ reason: "malformed", status }` for web adapter failure handling.
 *
 * - always returns `reason: "malformed"`
 * - `options.status.malformed` overrides the default `400`
 */
export function resolveVerifyFailure(options?: {
  status?: { malformed?: number };
}): IdParamFailure {
  return { reason: "malformed", status: options?.status?.malformed ?? 400 };
}
