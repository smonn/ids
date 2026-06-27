import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { Context, MiddlewareHandler } from "hono";
import { type IdCodec, type IdParamFailure, resolveIdParamFailure } from "./adapter-types.js";
import type { Id } from "../types.js";

export type { IdParamFailure };

/**
 * Typed error thrown into Hono's `app.onError` on validation failure.
 * Inspect `err.reason` and `err.status` in your error handler.
 */
export class IdParamError extends HTTPException {
  readonly reason: "brand_mismatch" | "malformed";

  constructor(reason: "brand_mismatch" | "malformed", status: ContentfulStatusCode) {
    super(status, { message: `ID validation failed: ${reason}` });
    this.name = "IdParamError";
    this.reason = reason;
  }
}

/** Options for `idParam` and `idQuery`. All fields are optional. */
export type IdParamOptions = {
  /**
   * Called instead of throwing when provided. The hook owns the response entirely —
   * the adapter neither throws nor writes a body.
   */
  onError?: (failure: IdParamFailure, c: Context) => Response | Promise<Response>;
  /**
   * Remap the default HTTP status for a failure reason without a full handler.
   * e.g. `{ brand_mismatch: 400 }` treats both failure kinds as 400.
   */
  status?: { brand_mismatch?: ContentfulStatusCode; malformed?: ContentfulStatusCode };
};

/**
 * Hono middleware that validates a named route param against a codec via `safeParse`.
 *
 * **Default (no options):** throws `IdParamError` (extends `HTTPException`) carrying both the HTTP
 * status and `reason` so the app's existing `onError` handler can discriminate by reason. The
 * adapter does not write a response body itself.
 *
 * **`options.onError`:** when provided, the hook owns the response entirely — the adapter neither
 * throws nor writes a response.
 *
 * **`options.status`:** remaps the default HTTP status for a reason without a full handler.
 *
 * - **Brand mismatch (`invalid_prefix`) → `reason: "brand_mismatch"`, default 404**
 * - **Malformed or missing ID → `reason: "malformed"`, default 400**
 *
 * On success, stores the canonical `Id<Brand>` in the Hono context under `paramName`
 * and calls `next()`.
 *
 * @example
 * ```ts
 * import { idParam, IdParamError } from "@smonn/ids/hono";
 * import { createTimestampId } from "@smonn/ids";
 *
 * const usr = createTimestampId("usr");
 *
 * // Default: throws IdParamError (extends HTTPException) → app.onError renders it
 * app.get("/users/:id", idParam("id", usr), (c) => {
 *   const id = c.get("id"); // Id<"usr">, canonical
 * });
 *
 * // Discriminate by reason in app.onError
 * app.onError((err, c) => {
 *   if (err instanceof IdParamError) {
 *     return c.json({ error: err.reason }, err.status); // err.reason: "brand_mismatch" | "malformed"
 *   }
 *   return c.json({ error: "internal" }, 500);
 * });
 *
 * // Override: consumer fully owns the response
 * app.get("/orgs/:id", idParam("id", org, {
 *   onError: (failure, c) => c.json({ error: failure.reason }, failure.status),
 * }), handler);
 *
 * // Or a lightweight status remap without a full handler
 * app.get("/things/:id", idParam("id", thing, { status: { brand_mismatch: 400 } }), handler);
 * ```
 */
export function idParam<ParamKey extends string, Brand extends string>(
  paramName: ParamKey,
  codec: IdCodec<Brand>,
  options?: IdParamOptions,
): MiddlewareHandler<{ Variables: Record<ParamKey, Id<Brand>> }> {
  return async (c, next) => {
    const raw = c.req.param(paramName);
    const result = codec.safeParse(raw);
    if (!result.ok) {
      const failure = resolveIdParamFailure(result.error, options);
      if (options?.onError) {
        return options.onError(failure, c);
      }
      throw new IdParamError(failure.reason, failure.status as ContentfulStatusCode);
    }
    c.set(paramName, result.id);
    await next();
    return;
  };
}

/**
 * Hono middleware that validates a named query-string param against a codec via `safeParse`.
 *
 * Same failure contract as `idParam` — same `IdParamFailure` shape, same `onError` / `status`
 * options — but reads `c.req.query(queryName)` instead of `c.req.param(queryName)`.
 *
 * **Default (no options):** throws `IdParamError` (extends `HTTPException`) carrying both the HTTP
 * status and `reason` so the app's existing `onError` handler can discriminate by reason. The
 * adapter does not write a response body itself.
 *
 * **`options.onError`:** when provided, the hook owns the response entirely — the adapter neither
 * throws nor writes a response.
 *
 * **`options.status`:** remaps the default HTTP status for a reason without a full handler.
 *
 * - **Brand mismatch (`invalid_prefix`) → `reason: "brand_mismatch"`, default 404**
 * - **Malformed or missing query param → `reason: "malformed"`, default 400**
 *
 * On success, stores the canonical `Id<Brand>` in the Hono context under `queryName`
 * and calls `next()`.
 *
 * @example
 * ```ts
 * import { idQuery, IdParamError } from "@smonn/ids/hono";
 * import { createTimestampId } from "@smonn/ids";
 *
 * const usr = createTimestampId("usr");
 *
 * // Default: throws IdParamError (extends HTTPException) → app.onError renders it
 * // GET /users?userId=usr_...
 * app.get("/users", idQuery("userId", usr), (c) => {
 *   const userId = c.get("userId"); // Id<"usr">, canonical
 * });
 *
 * // Discriminate by reason in app.onError
 * app.onError((err, c) => {
 *   if (err instanceof IdParamError) {
 *     return c.json({ error: err.reason }, err.status); // err.reason: "brand_mismatch" | "malformed"
 *   }
 *   return c.json({ error: "internal" }, 500);
 * });
 *
 * // Override: consumer fully owns the response
 * app.get("/search", idQuery("cursor", usr, {
 *   onError: (failure, c) => c.json({ error: failure.reason }, failure.status),
 * }), handler);
 * ```
 */
export function idQuery<ParamKey extends string, Brand extends string>(
  queryName: ParamKey,
  codec: IdCodec<Brand>,
  options?: IdParamOptions,
): MiddlewareHandler<{ Variables: Record<ParamKey, Id<Brand>> }> {
  return async (c, next) => {
    const raw = c.req.query(queryName);
    const result = codec.safeParse(raw);
    if (!result.ok) {
      const failure = resolveIdParamFailure(result.error, options);
      if (options?.onError) {
        return options.onError(failure, c);
      }
      throw new IdParamError(failure.reason, failure.status as ContentfulStatusCode);
    }
    c.set(queryName, result.id);
    await next();
    return;
  };
}
