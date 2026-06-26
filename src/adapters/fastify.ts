import type { FastifyReply, FastifyRequest } from "fastify";
import { type IdCodec, type IdParamFailure, resolveIdParamFailure } from "./adapter-types.js";
import type { Id } from "../types.js";

export type { IdParamFailure };

/**
 * Typed error thrown into Fastify's `setErrorHandler` on validation failure.
 * Inspect `err.reason` and `err.statusCode` in your error handler.
 */
export class IdParamError extends Error {
  readonly statusCode: number;
  readonly reason: "brand_mismatch" | "malformed";

  constructor(reason: "brand_mismatch" | "malformed", statusCode: number) {
    super(`ID validation failed: ${reason}`);
    this.name = "IdParamError";
    this.reason = reason;
    this.statusCode = statusCode;
  }
}

/** Options for `idParam` and `idQuery`. All fields are optional. */
export type IdParamOptions = {
  /**
   * Called instead of throwing when provided. The hook owns the response entirely —
   * the adapter does not throw.
   */
  onError?: (
    failure: IdParamFailure,
    request: FastifyRequest,
    reply: FastifyReply,
  ) => void | Promise<void>;
  /**
   * Remap the default HTTP status for a failure reason without a full handler.
   * e.g. `{ brand_mismatch: 400 }` treats both failure kinds as 400.
   */
  status?: { brand_mismatch?: number; malformed?: number };
};

/**
 * Fastify `preHandler` hook factory that validates a named route param against a codec via `safeParse`.
 *
 * **Default (no options):** throws `IdParamError` carrying `statusCode` and `reason` so the app's
 * existing `setErrorHandler` controls rendering. The adapter does not write a response body itself.
 *
 * **`options.onError`:** when provided, the hook calls `onError` and does not throw; the consumer
 * fully owns the response via `reply`.
 *
 * **`options.status`:** remaps the default HTTP status for a reason without a full handler.
 *
 * - **Brand mismatch (`invalid_prefix`) → `reason: "brand_mismatch"`, default 404**
 * - **Malformed or missing ID → `reason: "malformed"`, default 400**
 *
 * On success, stores the canonical `Id<Brand>` in `request.params` under `paramName`.
 *
 * **Return type note:** the returned hook is typed as
 * `(request: FastifyRequest<{ Params: Record<string, Id<Brand>> }>, reply: FastifyReply) => Promise<void>`.
 * Assigning it to a Fastify `preHandler` slot is backward-compatible (method-signature bivariance applies).
 * However, a locally-annotated variable typed as the bare `(request: FastifyRequest, reply: FastifyReply) => Promise<void>`
 * will produce a TypeScript error under `--strictFunctionTypes` because function parameter types are contravariant.
 * Use `preHandler` assignment or let TypeScript infer the type to avoid this.
 *
 * @example
 * ```ts
 * import { idParam, IdParamError } from "@smonn/ids/fastify";
 * import { createTimestampId } from "@smonn/ids";
 *
 * const usr = createTimestampId("usr");
 *
 * // Default: throws IdParamError → setErrorHandler renders it
 * fastify.get("/users/:id", { preHandler: idParam("id", usr) }, (request, reply) => {
 *   const id = request.params.id; // string (compile-time); Id<"usr"> at runtime after preHandler
 * });
 *
 * // Error handler receives the typed error
 * fastify.setErrorHandler((err, request, reply) => {
 *   if (err instanceof IdParamError) {
 *     reply.status(err.statusCode).send({ error: err.reason });
 *     return;
 *   }
 *   reply.send(err);
 * });
 *
 * // Override: consumer fully owns the error response
 * fastify.get("/orgs/:id", {
 *   preHandler: idParam("id", org, {
 *     onError: (failure, request, reply) =>
 *       reply.status(failure.status).send({ error: failure.reason }),
 *   }),
 * }, handler);
 *
 * // Or a lightweight status remap without a full handler
 * fastify.get("/things/:id", {
 *   preHandler: idParam("id", thing, { status: { brand_mismatch: 400 } }),
 * }, handler);
 * ```
 */
export function idParam<ParamKey extends string, Brand extends string>(
  paramName: ParamKey,
  codec: IdCodec<Brand>,
  options?: IdParamOptions,
): (
  request: FastifyRequest<{ Params: Record<string, Id<Brand>> }>,
  reply: FastifyReply,
) => Promise<void> {
  return async (request, reply): Promise<void> => {
    const raw = request.params[paramName];
    const result = codec.safeParse(raw);
    if (!result.ok) {
      const failure = resolveIdParamFailure(result.error, options);
      if (options?.onError) {
        await options.onError(failure, request, reply);
        return;
      }
      throw new IdParamError(failure.reason, failure.status);
    }
    request.params[paramName] = result.id;
  };
}

/**
 * Fastify `preHandler` hook factory that validates a named query-string param against a codec
 * via `safeParse`.
 *
 * Same failure contract as `idParam` — same `IdParamOptions` / `IdParamFailure` shape, same
 * `IdParamError` thrown into `setErrorHandler` — but reads
 * `(request.query as Record<string, string | undefined>)[queryName]` instead of `request.params`.
 *
 * **Default (no options):** throws `IdParamError` carrying `statusCode` and `reason` so the
 * app's existing `setErrorHandler` controls rendering. The adapter does not write a response
 * body itself.
 *
 * **`options.onError`:** when provided, the hook calls `onError` and does not throw; the
 * consumer fully owns the response via `reply`.
 *
 * **`options.status`:** remaps the default HTTP status for a reason without a full handler.
 *
 * - **Brand mismatch (`invalid_prefix`) → `reason: "brand_mismatch"`, default 404**
 * - **Malformed or missing query param → `reason: "malformed"`, default 400**
 *
 * On success, stores the canonical `Id<Brand>` in `request.query` under `queryName`.
 *
 * @example
 * ```ts
 * import { idQuery, IdParamError } from "@smonn/ids/fastify";
 * import { createTimestampId } from "@smonn/ids";
 *
 * const usr = createTimestampId("usr");
 *
 * // Default: throws IdParamError → setErrorHandler renders it
 * // GET /users?userId=usr_...
 * fastify.get("/users", { preHandler: idQuery("userId", usr) }, (request, reply) => {
 *   const userId = (request.query as Record<string, string>).userId; // Id<"usr"> at runtime
 * });
 *
 * // Override: consumer fully owns the error response
 * fastify.get("/search", {
 *   preHandler: idQuery("cursor", usr, {
 *     onError: (failure, request, reply) =>
 *       reply.status(failure.status).send({ error: failure.reason }),
 *   }),
 * }, handler);
 * ```
 */
export function idQuery<ParamKey extends string, Brand extends string>(
  queryName: ParamKey,
  codec: IdCodec<Brand>,
  options?: IdParamOptions,
): (
  request: FastifyRequest<{ Querystring: Record<string, string | undefined> }>,
  reply: FastifyReply,
) => Promise<void> {
  return async (request, reply): Promise<void> => {
    const raw = (request.query as Record<string, string | undefined>)[queryName];
    const result = codec.safeParse(raw);
    if (!result.ok) {
      const failure = resolveIdParamFailure(result.error, options);
      if (options?.onError) {
        await options.onError(failure, request, reply);
        return;
      }
      throw new IdParamError(failure.reason, failure.status);
    }
    (request.query as Record<string, unknown>)[queryName] = result.id;
  };
}
