import { GraphQLError, GraphQLScalarType, Kind } from "graphql";
import type { GraphQLFieldResolver, ValueNode } from "graphql";
import type { IdCodec, IdVerifiableCodec } from "./adapter-types.js";
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

/**
 * Wraps a GraphQL field resolver so the named ID arguments are authenticated before the resolver
 * body runs.
 *
 * GraphQL scalar coercers (`parseValue`/`parseLiteral`) are synchronous and cannot await the HMAC
 * check, so `idScalar` cannot verify a Signed Timestamp tag itself. `verifyIdArgs` performs that
 * async verification one layer out, at the resolver. For each `argName → codec` entry it calls
 * `codec.safeVerify(args[argName])`; a forged or tampered tag throws `GraphQLError` **before** the
 * wrapped resolver runs. A `null`/`undefined` arg is skipped (nullable/absent args pass through).
 * Present args' `safeVerify` calls all fire concurrently; the reported failure — if any — is the
 * first one in map order, not the first to settle.
 *
 * Both the **Signed Timestamp codec** and the **Wrapped key codec** satisfy
 * {@link IdVerifiableCodec}; passing any other codec is a compile-time type error. Verification
 * covers top-level args only — IDs nested inside input objects are not reached.
 *
 * **Pair with {@link idScalar}.** The wrapper checks the tag but returns `args` unchanged — it does
 * not substitute the canonical `id` from `safeVerify`. Front each verified arg with an `idScalar`
 * built from the same codec so `parseValue`/`parseLiteral` canonicalises the value (case, Crockford
 * aliases) before the resolver runs; on a plain `GraphQLString` arg a non-canonical variant would
 * verify yet reach the resolver un-normalised.
 *
 * **Only listed args are verified, and keys must match the field's argument names exactly.** On the
 * first invocation **for each schema coordinate** (`ParentType.fieldName`) the wrapper resolves
 * the field's declared argument names from `info` and throws a `GraphQLError` if any codec-map key
 * does not match a declared argument — hardening so a typo cannot silently disable verification.
 * Subsequent invocations on the **same coordinate** use the cached result. If the field cannot be
 * found in `parentType.getFields()`, the arg-name guard is skipped for that coordinate — this path
 * is **not** fail-closed for unknown fields — but per-ID `safeVerify` still runs on every
 * invocation regardless.
 *
 * @example
 * ```ts
 * import { verifyIdArgs } from "@smonn/ids/graphql";
 *
 * const resolve = verifyIdArgs({ userId: usr }, (_root, args, ctx) => {
 *   // args.userId is an authenticated Id<"usr">
 *   return ctx.loadUser(args.userId);
 * });
 * ```
 */
export function verifyIdArgs<
  TSource,
  TContext,
  TArgs extends Record<string, unknown> = Record<string, unknown>,
>(
  codecs: { [K in keyof TArgs]?: IdVerifiableCodec<string> },
  resolver: GraphQLFieldResolver<TSource, TContext, TArgs>,
): GraphQLFieldResolver<TSource, TContext, TArgs> {
  // Hoist to factory scope — the codec map is fixed at wrap time.
  const codecEntries = (
    Object.entries(codecs) as Array<[keyof TArgs & string, IdVerifiableCodec<string> | undefined]>
  ).filter((e): e is [keyof TArgs & string, IdVerifiableCodec<string>] => e[1] !== undefined);

  const checkedCoordinates = new Set<string>();

  return async (source, args, context, info) => {
    const coordinate = `${info.parentType.name}.${info.fieldName}`;
    if (!checkedCoordinates.has(coordinate)) {
      const field = info.parentType.getFields()[info.fieldName];
      if (field !== undefined) {
        const declaredNames = new Set(field.args.map((a) => a.name));
        for (const [key] of codecEntries) {
          if (!declaredNames.has(key)) {
            throw new GraphQLError(
              `verifyIdArgs: codec-map key "${key}" is not a declared argument on "${info.fieldName}"`,
            );
          }
        }
        checkedCoordinates.add(coordinate);
      }
    }

    const checks = codecEntries.map(([argName, codec]) => {
      const value = args[argName];
      return value == null ? null : codec.safeVerify(value);
    });
    const results = await Promise.all(checks.map((c) => c ?? Promise.resolve(null)));
    for (let i = 0; i < codecEntries.length; i++) {
      const result = results[i];
      if (result !== null && !result.ok) {
        throw new GraphQLError(`invalid ${codecEntries[i]![0]}`);
      }
    }
    return resolver(source, args, context, info);
  };
}
