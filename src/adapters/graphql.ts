import { GraphQLError, GraphQLScalarType, Kind } from "graphql";
import type { ValueNode } from "graphql";
import type { IdCodec } from "./adapter-types.js";
import type { Id } from "../types.js";

/** Extension of {@link IdCodec} that also requires `is()` — used by `idScalar` so `serialize` can validate strictly on the trusted outbound path. All concrete codec variants satisfy this. */
type GraphQLCodec<Brand extends string> = IdCodec<Brand> & {
  is(value: unknown): value is Id<Brand>;
};

/** {@link IdsError} class, {@link isIdsError} type guard, and {@link IdsErrorCode} union — re-exported from `"@smonn/ids"` for convenience. */
export { IdsError, isIdsError, type IdsErrorCode } from "../error.js";

/**
 * Builds a `GraphQLScalarType` for the given codec and brand.
 *
 * - `serialize` — validates strictly via `codec.is()`; throws `GraphQLError` on a non-canonical
 *   value and returns the value **unchanged** (no normalization) on success.
 * - `parseValue` — validates variables via `codec.safeParse`; throws `GraphQLError` on failure.
 *   Accepts mixed-case and Crockford visual aliases; always returns the canonical form.
 * - `parseLiteral` — validates inline `Kind.STRING` literals the same way as `parseValue`; throws
 *   `GraphQLError` for any other AST kind or on a failed `safeParse`.
 *
 * `graphql` must be installed as a peer dependency.
 *
 * @example
 * ```ts
 * import { idScalar } from "@smonn/ids/graphql";
 * import { createTimestampId } from "@smonn/ids";
 *
 * const usr = createTimestampId("usr");
 * const UserIdScalar = idScalar(usr, { name: "UserId", description: "A branded user ID." });
 * ```
 */
export function idScalar<Brand extends string>(
  codec: GraphQLCodec<Brand>,
  config: { name: string; description?: string },
): GraphQLScalarType<Id<Brand>, string> {
  const parse = (value: unknown): Id<Brand> => {
    const result = codec.safeParse(value);
    if (!result.ok) {
      throw new GraphQLError(`invalid ${config.name}`);
    }
    return result.id;
  };
  return new GraphQLScalarType<Id<Brand>, string>({
    name: config.name,
    description: config.description,
    serialize: (value: unknown): string => {
      if (!codec.is(value)) {
        throw new GraphQLError(`invalid ${config.name}`);
      }
      return value;
    },
    parseValue: parse,
    parseLiteral: (ast: ValueNode) => {
      if (ast.kind !== Kind.STRING) {
        throw new GraphQLError(`${config.name} must be a string literal, got ${ast.kind}`);
      }
      return parse(ast.value);
    },
  });
}
