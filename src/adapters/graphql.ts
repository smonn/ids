import { GraphQLError, GraphQLScalarType, Kind } from "graphql";
import type { ValueNode } from "graphql";
import type { IdColumnCodec } from "./adapter-types.js";
import type { Id } from "../types.js";

/**
 * Builds a `GraphQLScalarType` for the given codec and brand.
 *
 * - `serialize` — identity pass-through; an `Id<Brand>` is already the canonical wire string.
 * - `parseValue` — validates variables via `codec.safeParse`; throws `GraphQLError` on failure.
 * - `parseLiteral` — validates inline `Kind.STRING` literals; throws `GraphQLError` for any
 *   other AST kind or on a failed `safeParse`.
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
  codec: IdColumnCodec<Brand>,
  config: { name: string; description?: string },
): GraphQLScalarType<Id<Brand>, string> {
  const parse = (value: unknown): Id<Brand> => {
    const result = codec.safeParse(value);
    if (!result.ok) {
      throw new GraphQLError(`invalid ${config.name}: ${result.error}`);
    }
    return result.id;
  };
  return new GraphQLScalarType<Id<Brand>, string>({
    name: config.name,
    description: config.description,
    serialize: (value) => value as Id<Brand>,
    parseValue: parse,
    parseLiteral: (ast: ValueNode) => {
      if (ast.kind !== Kind.STRING) {
        throw new GraphQLError(`${config.name} must be a string literal, got ${ast.kind}`);
      }
      return parse(ast.value);
    },
  });
}
