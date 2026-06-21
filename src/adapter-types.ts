import type { ParseError, ParseResult } from "./types.js";

/** Discriminated failure value passed to `onError` and emitted to the framework's error handler. */
export type IdParamFailure =
  | { readonly reason: "brand_mismatch"; readonly status: number }
  | { readonly reason: "malformed"; readonly status: number };

/** Minimum structural type required by web and ORM adapters. Any codec variant satisfies this — all expose `safeParse`. Adapters only ever call `safeParse` — never key-dependent methods like `extractTimestamp`, `wrap`, or `unwrap`. */
export type IdCodec<Brand extends string> = {
  safeParse(value: unknown): ParseResult<Brand>;
};

/** Alias of {@link IdCodec} — preserved for backward compatibility with ORM adapter consumers. */
export type IdColumnCodec<Brand extends string> = IdCodec<Brand>;

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
