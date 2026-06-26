import type { NextFunction, Request, Response } from "express";
import { type IdCodec, type IdParamFailure, resolveIdParamFailure } from "./adapter-types.js";
import type { Id } from "../types.js";

export type { IdParamFailure };

/**
 * Typed error forwarded to Express's error pipeline (`next(err)`) on validation failure.
 * Inspect `err.reason` and `err.status` in error-handling middleware.
 */
export class IdParamError extends Error {
  readonly status: number;
  readonly reason: "brand_mismatch" | "malformed";

  constructor(reason: "brand_mismatch" | "malformed", status: number) {
    super(`ID validation failed: ${reason}`);
    this.name = "IdParamError";
    this.reason = reason;
    this.status = status;
  }
}

/** Options for `idParam` and `idQuery`. All fields are optional. */
export type IdParamOptions = {
  /**
   * Called instead of forwarding to `next(err)` when provided. The hook owns the response
   * entirely — the adapter does not call `next(err)` itself.
   */
  onError?: (failure: IdParamFailure, req: Request, res: Response, next: NextFunction) => void;
  /**
   * Remap the default HTTP status for a failure reason without a full handler.
   * e.g. `{ brand_mismatch: 400 }` treats both failure kinds as 400.
   */
  status?: { brand_mismatch?: number; malformed?: number };
};

/**
 * Express middleware that validates a named route param against a codec via `safeParse`.
 *
 * **Default (no options):** calls `next(err)` with an `IdParamError` carrying `status` and `reason`,
 * so the app's existing error-handling middleware controls rendering. The adapter does not write
 * a response body itself.
 *
 * **`options.onError`:** when provided, the hook owns the response entirely — the adapter does
 * not call `next(err)`.
 *
 * **`options.status`:** remaps the default HTTP status for a reason without a full handler.
 *
 * - **Brand mismatch (`invalid_prefix`) → `reason: "brand_mismatch"`, default 404**
 * - **Malformed or missing ID → `reason: "malformed"`, default 400**
 *
 * On success, stores the canonical `Id<Brand>` in `res.locals` under `paramName`
 * and calls `next()`.
 *
 * @example
 * ```ts
 * import { idParam, IdParamError } from "@smonn/ids/express";
 * import { createTimestampId } from "@smonn/ids";
 *
 * const usr = createTimestampId("usr");
 *
 * // Default: forwards error to app error-handling middleware
 * app.get("/users/:id", idParam("id", usr), (req, res) => {
 *   const id = res.locals.id; // Id<"usr">, canonical
 * });
 *
 * // Error-handling middleware receives the typed error
 * app.use((err, req, res, next) => {
 *   if (err instanceof IdParamError) {
 *     res.status(err.status).json({ error: err.reason });
 *     return;
 *   }
 *   next(err);
 * });
 *
 * // Override: consumer fully owns the response
 * app.get("/orgs/:id", idParam("id", org, {
 *   onError: (failure, req, res) => res.status(failure.status).json({ error: failure.reason }),
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
): (req: Request, res: Response<unknown, Record<ParamKey, Id<Brand>>>, next: NextFunction) => void {
  return (req, res, next): void => {
    const raw = req.params[paramName];
    const result = codec.safeParse(raw);
    if (!result.ok) {
      const failure = resolveIdParamFailure(result.error, options);
      if (options?.onError) {
        options.onError(failure, req, res, next);
        return;
      }
      next(new IdParamError(failure.reason, failure.status));
      return;
    }
    (res.locals as Record<string, unknown>)[paramName] = result.id;
    next();
  };
}

/**
 * Express middleware that validates a named query-string param against a codec via `safeParse`.
 *
 * Same failure contract as `idParam` — same `IdParamOptions` / `IdParamFailure` shape, same
 * `IdParamError` forwarded to `next(err)` — but reads `req.query[queryName]` instead of
 * `req.params[queryName]`.
 *
 * **Default (no options):** calls `next(err)` with an `IdParamError` carrying `status` and
 * `reason`, so the app's existing error-handling middleware controls rendering. The adapter
 * does not write a response body itself.
 *
 * **`options.onError`:** when provided, the hook owns the response entirely — the adapter does
 * not call `next(err)`.
 *
 * **`options.status`:** remaps the default HTTP status for a reason without a full handler.
 *
 * - **Brand mismatch (`invalid_prefix`) → `reason: "brand_mismatch"`, default 404**
 * - **Malformed or missing query param → `reason: "malformed"`, default 400**
 *
 * On success, stores the canonical `Id<Brand>` in `res.locals` under `queryName`
 * and calls `next()`.
 *
 * @example
 * ```ts
 * import { idQuery, IdParamError } from "@smonn/ids/express";
 * import { createTimestampId } from "@smonn/ids";
 *
 * const usr = createTimestampId("usr");
 *
 * // Default: forwards error to app error-handling middleware
 * // GET /users?userId=usr_...
 * app.get("/users", idQuery("userId", usr), (req, res) => {
 *   const userId = res.locals.userId; // Id<"usr">, canonical
 * });
 *
 * // Override: consumer fully owns the response
 * app.get("/search", idQuery("cursor", usr, {
 *   onError: (failure, req, res) => res.status(failure.status).json({ error: failure.reason }),
 * }), handler);
 * ```
 */
export function idQuery<ParamKey extends string, Brand extends string>(
  queryName: ParamKey,
  codec: IdCodec<Brand>,
  options?: IdParamOptions,
): (req: Request, res: Response<unknown, Record<ParamKey, Id<Brand>>>, next: NextFunction) => void {
  return (req, res, next): void => {
    const raw = req.query[queryName] as string | undefined;
    const result = codec.safeParse(raw);
    if (!result.ok) {
      const failure = resolveIdParamFailure(result.error, options);
      if (options?.onError) {
        options.onError(failure, req, res, next);
        return;
      }
      next(new IdParamError(failure.reason, failure.status));
      return;
    }
    (res.locals as Record<string, unknown>)[queryName] = result.id;
    next();
  };
}
