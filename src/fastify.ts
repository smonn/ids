import type { FastifyReply, FastifyRequest } from "fastify";
import type { IdParamFailure } from "./adapter-types.js";
import type { ParseResult } from "./types.js";

export type { IdParamFailure };

type IdCodec<Brand extends string> = {
  safeParse(value: unknown): ParseResult<Brand>;
};

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

/** Options for `idParam`. All fields are optional. */
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
 * @example
 * ```ts
 * import { idParam, IdParamError } from "@smonn/ids/fastify";
 * import { createTimestampId } from "@smonn/ids";
 *
 * const usr = createTimestampId("usr");
 *
 * // Default: throws IdParamError → setErrorHandler renders it
 * fastify.get("/users/:id", { preHandler: idParam("id", usr) }, (request, reply) => {
 *   const id = request.params.id; // Id<"usr">, canonical
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
): (request: FastifyRequest, reply: FastifyReply) => Promise<void> {
  return async (request, reply): Promise<void> => {
    const raw = (request.params as Record<string, unknown>)[paramName];
    const result = codec.safeParse(raw);
    if (!result.ok) {
      const reason =
        result.error === "invalid_prefix" ? ("brand_mismatch" as const) : ("malformed" as const);
      const defaultStatus = reason === "brand_mismatch" ? 404 : 400;
      const status = options?.status?.[reason] ?? defaultStatus;
      const failure: IdParamFailure = { reason, status };
      if (options?.onError) {
        await options.onError(failure, request, reply);
        return;
      }
      throw new IdParamError(reason, status);
    }
    (request.params as Record<string, unknown>)[paramName] = result.id;
  };
}
