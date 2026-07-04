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
   * Called when ID validation fails. If the hook sends a response (i.e. `res.headersSent`
   * is `true` after the hook returns), the adapter takes no further action. If the hook
   * returns without sending a response — including if it calls `next()` instead of
   * `next(err)` — the adapter falls back to its default error behavior and calls
   * `next(new IdParamError(...))`, ensuring the route handler never runs with an
   * invalid or missing ID.
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
 * **`options.onError`:** when provided, the adapter calls the hook on validation failure. If
 * the hook sends a response (`res.headersSent` is `true` after it returns), the adapter takes
 * no further action. Otherwise — including if the hook calls `next()` instead of `next(err)` —
 * the adapter falls back to `next(new IdParamError(...))`, so the route handler never runs with
 * an invalid ID.
 *
 * **`options.status`:** remaps the default HTTP status for a reason without a full handler.
 *
 * - **Brand mismatch (`invalid_prefix`) → `reason: "brand_mismatch"`, default 404**
 * - **Malformed or missing ID → `reason: "malformed"`, default 400**
 *
 * **Storage:** on success, stores the canonical `Id<Brand>` in `res.locals[paramName]` and calls `next()`.
 * This contrasts with the Fastify adapter, which mutates `request.params[paramName]` in place.
 * Express writes to `res.locals` because it has no mutable `request.params` contract that is safe
 * to write to — `req.params` is populated by Express's router and is not intended as a side-channel
 * for middleware output, while `res.locals` is the idiomatic per-request storage object.
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
        let nextCalledWithError = false;
        const hookNext: NextFunction = (err?: unknown): void => {
          if (err !== undefined) {
            nextCalledWithError = true;
            next(err);
          }
        };
        options.onError(failure, req, res, hookNext);
        if (!nextCalledWithError && !res.headersSent) {
          next(new IdParamError(failure.reason, failure.status));
        }
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
 * **`options.onError`:** when provided, the adapter calls the hook on validation failure. If
 * the hook sends a response (`res.headersSent` is `true` after it returns), the adapter takes
 * no further action. Otherwise — including if the hook calls `next()` instead of `next(err)` —
 * the adapter falls back to `next(new IdParamError(...))`, so the route handler never runs with
 * an invalid ID.
 *
 * **`options.status`:** remaps the default HTTP status for a reason without a full handler.
 *
 * - **Brand mismatch (`invalid_prefix`) → `reason: "brand_mismatch"`, default 404**
 * - **Malformed or missing query param → `reason: "malformed"`, default 400**
 *
 * **Storage:** on success, stores the canonical `Id<Brand>` in `res.locals[queryName]` and calls `next()`.
 * This contrasts with the Fastify adapter, which mutates `request.query[queryName]` in place. See
 * the `idParam` JSDoc for the rationale on the `res.locals` choice.
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
    const raw: unknown = req.query[queryName];
    const result = codec.safeParse(raw);
    if (!result.ok) {
      const failure = resolveIdParamFailure(result.error, options);
      if (options?.onError) {
        let nextCalledWithError = false;
        const hookNext: NextFunction = (err?: unknown): void => {
          if (err !== undefined) {
            nextCalledWithError = true;
            next(err);
          }
        };
        options.onError(failure, req, res, hookNext);
        if (!nextCalledWithError && !res.headersSent) {
          next(new IdParamError(failure.reason, failure.status));
        }
        return;
      }
      next(new IdParamError(failure.reason, failure.status));
      return;
    }
    (res.locals as Record<string, unknown>)[queryName] = result.id;
    next();
  };
}
