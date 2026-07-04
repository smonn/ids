import type { FastifyReply, FastifyRequest } from "fastify";
import {
  type IdCodec,
  type IdParamFailure,
  type IdVerifiableCodec,
  resolveIdParamFailure,
} from "./adapter-types.js";
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

/**
 * Options for `idParam` and `idQuery`. All fields are optional.
 *
 * **Default validation is structural** — `safeParse` checks prefix and base32 form but does not
 * verify any cryptographic tag. For Signed Timestamp IDs, pass a codec that satisfies
 * `IdVerifiableCodec` and set `verify: true` to also authenticate the HMAC tag.
 */
export type IdParamOptions = {
  /**
   * Called when ID validation fails. If the hook sends a response (i.e. `reply.sent` is
   * `true` after the hook resolves), the adapter takes no further action. If the hook
   * returns without sending a response, the adapter falls back to its default error
   * behavior — throwing `IdParamError` — so the route handler never runs with an
   * invalid or missing ID.
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
 * Extends {@link IdParamOptions} with opt-in HMAC tag verification.
 * Only accepted when the codec satisfies {@link IdVerifiableCodec} (e.g. a Signed Timestamp codec).
 * When `verify: true`, the adapter calls `codec.safeVerify(raw)` after structural parse succeeds;
 * a tag mismatch is routed through the existing `"malformed"` failure path.
 */
export type IdParamVerifyOptions = IdParamOptions & {
  /** When `true`, calls `codec.safeVerify(raw)` after structural parse and treats a tag failure as `"malformed"`. */
  verify?: true;
};

/**
 * Fastify `preHandler` hook factory that validates a named route param against a codec via `safeParse`.
 *
 * **Default (no options):** throws `IdParamError` carrying `statusCode` and `reason` so the app's
 * existing `setErrorHandler` controls rendering. The adapter does not write a response body itself.
 *
 * **`options.onError`:** when provided, the adapter awaits the hook on validation failure. If the
 * hook sends a response (`reply.sent` is `true` after it resolves), the adapter takes no further
 * action. Otherwise, the adapter falls back to throwing `IdParamError`, so the route handler
 * never runs with an invalid ID.
 *
 * **`options.status`:** remaps the default HTTP status for a reason without a full handler.
 *
 * - **Brand mismatch (`invalid_prefix`) → `reason: "brand_mismatch"`, default 404**
 * - **Malformed or missing ID → `reason: "malformed"`, default 400**
 *
 * **Storage:** on success, stores the canonical `Id<Brand>` in `request.params[paramName]` by mutating
 * the params object in place. This contrasts with the Express adapter, which writes to `res.locals[paramName]`.
 * Fastify writes to `request.params` in place because Fastify's preHandler lifecycle runs before the route
 * handler and its `request` object is the idiomatic side-channel for enriched request data; there is no
 * `reply.locals` equivalent in Fastify.
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
  codec: IdVerifiableCodec<Brand>,
  options?: IdParamVerifyOptions,
): (
  request: FastifyRequest<{ Params: Record<string, Id<Brand>> }>,
  reply: FastifyReply,
) => Promise<void>;
export function idParam<ParamKey extends string, Brand extends string>(
  paramName: ParamKey,
  codec: IdCodec<Brand>,
  options?: IdParamOptions,
): (
  request: FastifyRequest<{ Params: Record<string, Id<Brand>> }>,
  reply: FastifyReply,
) => Promise<void>;
export function idParam<ParamKey extends string, Brand extends string>(
  paramName: ParamKey,
  codec: IdCodec<Brand>,
  options?: IdParamVerifyOptions,
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
        if (!reply.sent) {
          throw new IdParamError(failure.reason, failure.status);
        }
        return;
      }
      throw new IdParamError(failure.reason, failure.status);
    }
    if (options?.verify) {
      const verifyResult = await (codec as IdVerifiableCodec<Brand>).safeVerify(raw);
      if (!verifyResult.ok) {
        const failure: IdParamFailure = {
          reason: "malformed",
          status: options.status?.malformed ?? 400,
        };
        if (options.onError) {
          await options.onError(failure, request, reply);
          if (!reply.sent) {
            throw new IdParamError(failure.reason, failure.status);
          }
          return;
        }
        throw new IdParamError(failure.reason, failure.status);
      }
    }
    request.params[paramName] = result.id;
  };
}

/**
 * Fastify `preHandler` hook factory that validates a named query-string param against a codec
 * via `safeParse`.
 *
 * Same failure contract as `idParam` — same `IdParamOptions` / `IdParamFailure` shape, same
 * `IdParamError` thrown into `setErrorHandler` — but reads `request.query[queryName]` instead of
 * `request.params`.
 *
 * **Default (no options):** throws `IdParamError` carrying `statusCode` and `reason` so the
 * app's existing `setErrorHandler` controls rendering. The adapter does not write a response
 * body itself.
 *
 * **`options.onError`:** when provided, the adapter awaits the hook on validation failure. If the
 * hook sends a response (`reply.sent` is `true` after it resolves), the adapter takes no further
 * action. Otherwise, the adapter falls back to throwing `IdParamError`, so the route handler
 * never runs with an invalid ID.
 *
 * **`options.status`:** remaps the default HTTP status for a reason without a full handler.
 *
 * - **Brand mismatch (`invalid_prefix`) → `reason: "brand_mismatch"`, default 404**
 * - **Malformed or missing query param → `reason: "malformed"`, default 400**
 *
 * **Storage:** on success, stores the canonical `Id<Brand>` in `request.query[queryName]` by mutating
 * the query object in place. This contrasts with the Express adapter, which writes to `res.locals[queryName]`.
 * See the `idParam` JSDoc for the rationale on in-place mutation.
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
 *   const userId = request.query.userId; // string (compile-time); Id<"usr"> at runtime
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
  codec: IdVerifiableCodec<Brand>,
  options?: IdParamVerifyOptions,
): (
  request: FastifyRequest<{ Querystring: Record<string, Id<Brand>> }>,
  reply: FastifyReply,
) => Promise<void>;
export function idQuery<ParamKey extends string, Brand extends string>(
  queryName: ParamKey,
  codec: IdCodec<Brand>,
  options?: IdParamOptions,
): (
  request: FastifyRequest<{ Querystring: Record<string, Id<Brand>> }>,
  reply: FastifyReply,
) => Promise<void>;
export function idQuery<ParamKey extends string, Brand extends string>(
  queryName: ParamKey,
  codec: IdCodec<Brand>,
  options?: IdParamVerifyOptions,
): (
  request: FastifyRequest<{ Querystring: Record<string, Id<Brand>> }>,
  reply: FastifyReply,
) => Promise<void> {
  return async (request, reply): Promise<void> => {
    const raw = request.query[queryName];
    const result = codec.safeParse(raw);
    if (!result.ok) {
      const failure = resolveIdParamFailure(result.error, options);
      if (options?.onError) {
        await options.onError(failure, request, reply);
        if (!reply.sent) {
          throw new IdParamError(failure.reason, failure.status);
        }
        return;
      }
      throw new IdParamError(failure.reason, failure.status);
    }
    if (options?.verify) {
      const verifyResult = await (codec as IdVerifiableCodec<Brand>).safeVerify(raw);
      if (!verifyResult.ok) {
        const failure: IdParamFailure = {
          reason: "malformed",
          status: options.status?.malformed ?? 400,
        };
        if (options.onError) {
          await options.onError(failure, request, reply);
          if (!reply.sent) {
            throw new IdParamError(failure.reason, failure.status);
          }
          return;
        }
        throw new IdParamError(failure.reason, failure.status);
      }
    }
    request.query[queryName] = result.id;
  };
}
