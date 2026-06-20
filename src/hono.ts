import type { MiddlewareHandler } from "hono";
import type { Id, ParseResult } from "./types.js";

type IdCodec<Brand extends string> = {
  safeParse(value: unknown): ParseResult<Brand>;
};

/**
 * Hono middleware that validates a named route param against a codec via `safeParse`.
 *
 * - **Brand mismatch (`invalid_prefix`) → 404**: the resource cannot exist under this route.
 * - **Malformed or missing ID (`not_string` | `invalid_base32`) → 400**: the request is invalid.
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
 * app.get("/users/:id", idParam("id", usr), (c) => {
 *   const id = c.get("id"); // Id<"usr">, canonical
 * });
 * ```
 */
export function idParam<ParamKey extends string, Brand extends string>(
  paramName: ParamKey,
  codec: IdCodec<Brand>,
): MiddlewareHandler<{ Variables: Record<ParamKey, Id<Brand>> }> {
  return async (c, next) => {
    const raw = c.req.param(paramName);
    const result = codec.safeParse(raw);
    if (!result.ok) {
      if (result.error === "invalid_prefix") {
        return c.text("Not Found", 404);
      }
      return c.text("Bad Request", 400);
    }
    c.set(paramName, result.id);
    await next();
    return;
  };
}
