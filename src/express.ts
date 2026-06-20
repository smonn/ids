import type { NextFunction, Request, Response } from "express";
import type { Id, ParseResult } from "./types.js";

type IdCodec<Brand extends string> = {
  safeParse(value: unknown): ParseResult<Brand>;
};

/**
 * Express middleware that validates a named route param against a codec via `safeParse`.
 *
 * - **Brand mismatch (`invalid_prefix`) → 404**: the resource cannot exist under this route.
 * - **Malformed or missing ID (`not_string` | `invalid_base32`) → 400**: the request is invalid.
 *
 * On success, stores the canonical `Id<Brand>` in `res.locals` under `paramName`
 * and calls `next()`.
 *
 * @example
 * ```ts
 * import { idParam } from "@smonn/ids/express";
 * import { createTimestampId } from "@smonn/ids";
 *
 * const usr = createTimestampId("usr");
 * app.get("/users/:id", idParam("id", usr), (req, res) => {
 *   const id = res.locals.id; // Id<"usr">, canonical
 * });
 * ```
 */
export function idParam<ParamKey extends string, Brand extends string>(
  paramName: ParamKey,
  codec: IdCodec<Brand>,
): (req: Request, res: Response<unknown, Record<ParamKey, Id<Brand>>>, next: NextFunction) => void {
  return (req, res, next): void => {
    const raw = req.params[paramName];
    const result = codec.safeParse(raw);
    if (!result.ok) {
      if (result.error === "invalid_prefix") {
        res.status(404).send("Not Found");
        return;
      }
      res.status(400).send("Bad Request");
      return;
    }
    (res.locals as Record<string, unknown>)[paramName] = result.id;
    next();
  };
}
