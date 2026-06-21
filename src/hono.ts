import { HTTPException } from "hono/http-exception";
import type { Context, MiddlewareHandler } from "hono";
import type { IdCodec, IdParamFailure } from "./adapter-types.js";
import { resolveIdParamFailure } from "./adapter-types.js";
import type { Id } from "./types.js";

export type { IdParamFailure };

/** Options for `idParam`. All fields are optional. */
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
  status?: { brand_mismatch?: number; malformed?: number };
};

/**
 * Hono middleware that validates a named route param against a codec via `safeParse`.
 *
 * **Default (no options):** throws `HTTPException(status)` so the app's existing `onError` handler
 * controls rendering and content negotiation. The adapter does not write a response body itself.
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
 * import { idParam } from "@smonn/ids/hono";
 * import { createTimestampId } from "@smonn/ids";
 *
 * const usr = createTimestampId("usr");
 *
 * // Default: throws HTTPException → app.onError renders it
 * app.get("/users/:id", idParam("id", usr), (c) => {
 *   const id = c.get("id"); // Id<"usr">, canonical
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
      throw new HTTPException(failure.status as ConstructorParameters<typeof HTTPException>[0]);
    }
    c.set(paramName, result.id);
    await next();
    return;
  };
}
