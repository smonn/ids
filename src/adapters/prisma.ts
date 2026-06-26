import type { ModelQueryOptionsCb, ModelQueryOptionsCbArgs } from "@prisma/client/runtime/library";
import { readIdColumn, readIdColumnNullable, type IdColumnCodec } from "./adapter-types.js";
import type { Id } from "../types.js";

/** {@link IdsError} class, {@link isIdsError} type guard, and {@link IdsErrorCode} union — re-exported from `"@smonn/ids"` for convenience. */
export { IdsError, isIdsError, type IdsErrorCode } from "../error.js";

export type { IdColumnCodec };

/**
 * Extension of {@link IdColumnCodec} that also exposes synchronous `generate()`.
 * Required by {@link idField} so that {@link IdTransform.defaultQuery} can produce
 * IDs at write time. Every full codec variant (Timestamp, Reverse Timestamp) satisfies
 * this; async-generate codecs (Opaque, Signed, Wrapped, Digest) do not and are
 * therefore unsupported by `defaultQuery`.
 */
export type IdGeneratingCodec<Brand extends string> = IdColumnCodec<Brand> & {
  generate(): Id<Brand>;
};

/**
 * The per-model object returned by {@link IdTransform.defaultQuery}, suitable for
 * the model-level value inside a Prisma `$extends({ query: { modelName: … } })` block.
 * Structurally identical to `{ [operation: string]: ModelQueryOptionsCb }` from
 * `@prisma/client/runtime/library`.
 */
export type IdQueryField = { [operation: string]: ModelQueryOptionsCb };

/**
 * Typed `$extends` result-component field definition produced by
 * {@link IdTransform.computeField} — a `{ needs, compute }` pair whose `compute`
 * return type is statically `Id<Brand>`, so the extended-client model field is
 * typed correctly without a per-call-site cast.
 */
export type IdComputeField<Brand extends string> = {
  needs: Record<string, boolean>;
  compute: (model: Record<string, unknown>) => Id<Brand>;
};

/**
 * Typed `$extends` result-component field definition produced by
 * {@link IdTransform.computeNullableField} — like {@link IdComputeField} but
 * `compute` returns `Id<Brand> | null` for nullable columns.
 */
export type NullableIdComputeField<Brand extends string> = {
  needs: Record<string, boolean>;
  compute: (model: Record<string, unknown>) => Id<Brand> | null;
};

/**
 * Read/write transform pair and `$extends` result-component factory for
 * integrating `Id<Brand>` with Prisma extensions.
 */
export type IdTransform<Brand extends string> = {
  /**
   * Read transform: validates the raw database value via `safeParse` and returns
   * `Id<Brand>`. Throws if the value is missing, malformed, or belongs to a
   * different brand.
   */
  read(value: unknown): Id<Brand>;
  /**
   * Nullable read transform: returns `null` when `value` is `null` or `undefined`;
   * otherwise delegates to {@link read}. Use for optional foreign keys.
   */
  readNullable(value: unknown): Id<Brand> | null;
  /**
   * Write transform: passes `Id<Brand>` through as its canonical string form.
   * `Id<Brand>` is already the canonical string, so this is an identity function
   * at runtime.
   *
   * Use in a Prisma `$extends` query component or explicit `data` mapping.
   */
  write(value: Id<Brand>): string;
  /**
   * Creates a typed `$extends` result-component field definition that carries
   * `Id<Brand>` through Prisma's type machinery without a per-call-site cast.
   *
   * @param fieldName - The model field to read from (e.g. `"id"`).
   * @returns An {@link IdComputeField} whose `compute` return type is statically
   * `Id<Brand>`, so the extended-client model field is typed correctly.
   *
   * @example
   * ```ts
   * const xprisma = prisma.$extends({
   *   result: {
   *     user: { id: userIdField.computeField("id") },
   *   },
   * });
   * // xprisma.user.findUnique(…).id is typed as Id<"usr"> — no cast required
   * ```
   */
  computeField(fieldName: string): IdComputeField<Brand>;
  /**
   * Creates a `$extends` query-component model slice that auto-generates
   * `Id<Brand>` values for `create`, `createMany`, and `upsert` operations
   * when the field is absent, `undefined`, or `null` in `args.data` (or
   * `args.create` for upsert). Explicitly supplied values are always passed
   * through unchanged.
   *
   * @param fieldName - The model field to auto-generate (e.g. `"id"`).
   * @returns An {@link IdQueryField} suitable for the model-level value inside
   * a Prisma `$extends({ query: { modelName: … } })` block.
   *
   * @example
   * ```ts
   * const xprisma = prisma.$extends({
   *   query: { user: userIdField.defaultQuery("id") },
   *   result: { user: { id: userIdField.computeField("id") } },
   * });
   * // id is auto-filled on create, and typed as Id<"usr"> on read
   * await xprisma.user.create({ data: { name: "Alice" } });
   * ```
   */
  defaultQuery(fieldName: string): IdQueryField;
  /**
   * Like {@link computeField} but for nullable columns — `compute` returns
   * `Id<Brand> | null` instead of `Id<Brand>`.
   *
   * @param fieldName - The nullable model field to read from.
   * @returns A {@link NullableIdComputeField} whose `compute` returns `Id<Brand> | null`.
   */
  computeNullableField(fieldName: string): NullableIdComputeField<Brand>;
};

/**
 * Creates a read/write transform pair for use with Prisma's `$extends` extension model.
 *
 * Works with any codec variant exposing `safeParse`.
 *
 * Use `computeField(fieldName)` to produce a typed `$extends` result-component
 * field definition — the brand is carried through Prisma's type machinery
 * automatically and no per-call-site cast is required.
 *
 * @example
 * ```ts
 * import { idField } from "@smonn/ids/prisma";
 * import { createTimestampId } from "@smonn/ids";
 *
 * const usr = createTimestampId("usr");
 * const userIdField = idField(usr);
 *
 * const xprisma = prisma.$extends({
 *   result: {
 *     user: { id: userIdField.computeField("id") },
 *   },
 * });
 * // xprisma.user.findUnique(…).id is typed as Id<"usr"> — no cast required
 * ```
 */
export function idField<Brand extends string>(codec: IdGeneratingCodec<Brand>): IdTransform<Brand> {
  const { generate } = codec;
  return {
    read(value: unknown): Id<Brand> {
      return readIdColumn(codec, value);
    },
    readNullable(value: unknown): Id<Brand> | null {
      return readIdColumnNullable(codec, value);
    },
    write(value: Id<Brand>): string {
      return value;
    },
    computeField(fieldName: string) {
      return {
        needs: { [fieldName]: true },
        // Prisma's $extends types `compute` as returning `any` in its constraint
        // type (DynamicResultExtensionArgs). Returning a pre-built object with an
        // explicit Id<Brand> return type on `compute` causes TypeScript to infer
        // the brand through the `& R` intersection in $extends — encapsulating
        // the single necessary cast here rather than pushing it to every call site.
        compute: (model: Record<string, unknown>): Id<Brand> =>
          readIdColumn(codec, model[fieldName]),
      };
    },
    defaultQuery(fieldName: string): IdQueryField {
      function injectIfAbsent(data: Record<string, unknown>): Record<string, unknown> {
        if (data[fieldName] == null) {
          return { ...data, [fieldName]: generate() };
        }
        return data;
      }

      type QueryArg = Parameters<ModelQueryOptionsCbArgs["query"]>[0];

      return {
        async create({ args, query }) {
          const data = args.data as Record<string, unknown> | null | undefined;
          const nextArgs =
            data != null ? ({ ...args, data: injectIfAbsent(data) } as unknown as QueryArg) : args;
          return query(nextArgs);
        },
        async createMany({ args, query }) {
          const data = args.data as Array<Record<string, unknown>> | null | undefined;
          const nextArgs = Array.isArray(data)
            ? ({ ...args, data: data.map((item) => injectIfAbsent(item)) } as unknown as QueryArg)
            : args;
          return query(nextArgs);
        },
        async upsert({ args, query }) {
          const createData = args.create as Record<string, unknown> | null | undefined;
          const nextArgs =
            createData != null
              ? ({ ...args, create: injectIfAbsent(createData) } as unknown as QueryArg)
              : args;
          return query(nextArgs);
        },
      };
    },
    computeNullableField(fieldName: string) {
      return {
        needs: { [fieldName]: true },
        compute: (model: Record<string, unknown>): Id<Brand> | null =>
          readIdColumnNullable(codec, model[fieldName]),
      };
    },
  };
}
