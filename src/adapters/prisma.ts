import type { ModelQueryOptionsCb, ModelQueryOptionsCbArgs } from "@prisma/client/runtime/client";
import {
  readIdColumn,
  readIdColumnNullable,
  writeIdColumn,
  writeIdColumnNullable,
  type IdColumnCodec,
  type IdGeneratingCodec,
} from "./adapter-types.js";
import type { Id } from "../types.js";

/** {@link IdsError} class, {@link isIdsError} type guard, and {@link IdsErrorCode} union — re-exported from `"@smonn/ids"` for convenience. */
export { IdsError, isIdsError, type IdsErrorCode } from "../error.js";

export type { IdColumnCodec, IdGeneratingCodec };

/**
 * The per-model object returned by {@link IdTransform.defaultQuery}, suitable for
 * the model-level value inside a Prisma `$extends({ query: { modelName: … } })` block.
 * Structurally identical to `{ [operation: string]: ModelQueryOptionsCb }` from
 * `@prisma/client/runtime/client`.
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
   * Write transform: validates `value` via `codec.safeParse` and returns the
   * canonical string form. Throws `IdsError("invalid_id")` if the value is
   * invalid, belongs to a different brand, or is `null`/`undefined`.
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
   * `Id<Brand>` values for `create`, `createMany`, `createManyAndReturn`, and
   * `upsert` operations when the field is absent, `undefined`, or `null` in
   * `args.data` (or `args.create` for upsert). When the field is absent,
   * `undefined`, or `null`, a fresh `Id<Brand>` is injected; when present, the
   * value is validated via `codec.safeParse` and `IdsError("invalid_id")` is
   * thrown if invalid.
   *
   * @param fieldName - The model field to auto-generate (e.g. `"id"`).
   * @returns An {@link IdQueryField} suitable for the model-level value inside
   * a Prisma `$extends({ query: { modelName: … } })` block.
   *
   * @remarks
   * **Nested-relation-write limitation:** ID fields inside nested relation writes
   * (`data: { posts: { create: { … } } }`, `connectOrCreate.create`, etc.) are
   * **not** reached by any model-level `defaultQuery` hook. Callers must validate
   * or generate nested IDs explicitly at the service layer.
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
 * The read/nullable-read/write surface returned by {@link nullableIdField} —
 * mirrors the nullable methods of {@link IdTransform} but omits `defaultQuery`,
 * `read`, and `computeField` since nullable FK columns neither auto-generate IDs
 * nor require a non-null read path at the top level.
 */
export type NullableIdTransform<Brand extends string> = {
  readNullable(value: unknown): Id<Brand> | null;
  write(value: Id<Brand> | null | undefined): string | null;
  computeNullableField(fieldName: string): NullableIdComputeField<Brand>;
};

/**
 * Creates a read/write transform pair for use with Prisma's `$extends` extension model.
 *
 * Requires a codec variant that exposes a synchronous `generate()` in addition to `safeParse` — see {@link IdGeneratingCodec}. Only the **Timestamp codec** and **Reverse Timestamp codec** qualify; Opaque, Signed, Wrapped, and Digest codecs cannot be passed to `idField()`.
 *
 * Use `computeField(fieldName)` to produce a typed `$extends` result-component
 * field definition — the brand is carried through Prisma's type machinery
 * automatically and no per-call-site cast is required.
 *
 * For codecs that do not expose a synchronous `generate()` (Opaque Timestamp,
 * Signed Timestamp, Wrapped key, Digest), use {@link idFieldNonGenerating} instead —
 * it accepts any {@link IdColumnCodec} and omits `defaultQuery`.
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
      return writeIdColumn(codec, value);
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
      function injectOrValidate(data: Record<string, unknown>): Record<string, unknown> {
        if (data[fieldName] == null) {
          return { ...data, [fieldName]: generate() };
        }
        return { ...data, [fieldName]: writeIdColumn(codec, data[fieldName] as Id<Brand>) };
      }

      type QueryArg = Parameters<ModelQueryOptionsCbArgs["query"]>[0];

      function applyInjectOrValidate({ args, query }: ModelQueryOptionsCbArgs): Promise<unknown> {
        const data = args.data as
          | Array<Record<string, unknown>>
          | Record<string, unknown>
          | null
          | undefined;
        let nextArgs: QueryArg;
        if (Array.isArray(data)) {
          nextArgs = {
            ...args,
            data: data.map((item) => injectOrValidate(item)),
          } as unknown as QueryArg;
        } else if (data != null) {
          nextArgs = { ...args, data: injectOrValidate(data) } as unknown as QueryArg;
        } else {
          nextArgs = args;
        }
        return query(nextArgs);
      }

      return {
        async create({ args, query }) {
          const data = args.data as Record<string, unknown> | null | undefined;
          const nextArgs =
            data != null
              ? ({ ...args, data: injectOrValidate(data) } as unknown as QueryArg)
              : args;
          return query(nextArgs);
        },
        createMany: applyInjectOrValidate,
        createManyAndReturn: applyInjectOrValidate,
        async upsert({ args, query }) {
          const createData = args.create as Record<string, unknown> | null | undefined;
          const nextArgs =
            createData != null
              ? ({ ...args, create: injectOrValidate(createData) } as unknown as QueryArg)
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

/**
 * Standalone nullable counterpart of {@link idField} for Prisma adapter symmetry
 * with the other ORM adapters ({@link nullableIdColumn} in Drizzle/Kysely,
 * `nullableIdType` in MikroORM, `nullableIdTransformer` in TypeORM).
 *
 * Accepts any {@link IdColumnCodec} — no synchronous `generate()` required,
 * because nullable FK columns do not auto-generate IDs.
 *
 * @example
 * ```ts
 * import { nullableIdField } from "@smonn/ids/prisma";
 * import { createTimestampId } from "@smonn/ids";
 *
 * const usr = createTimestampId("usr");
 * const authorIdField = nullableIdField(usr);
 *
 * const xprisma = prisma.$extends({
 *   result: {
 *     post: { authorId: authorIdField.computeNullableField("authorId") },
 *   },
 * });
 * // xprisma.post.findUnique(…).authorId is typed as Id<"usr"> | null
 * ```
 */
export function nullableIdField<Brand extends string>(
  codec: IdColumnCodec<Brand>,
): NullableIdTransform<Brand> {
  return {
    readNullable(value: unknown): Id<Brand> | null {
      return readIdColumnNullable(codec, value);
    },
    write(value: Id<Brand> | null | undefined): string | null {
      return writeIdColumnNullable(codec, value);
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

/**
 * Non-generating sibling of {@link idField} for codec variants that do not expose a
 * synchronous `generate()` — Opaque Timestamp, Signed Timestamp, Wrapped key,
 * and Digest codecs all qualify.
 *
 * Accepts any {@link IdColumnCodec} (the wider constraint that only requires
 * `safeParse`) and returns the full read/transform surface of {@link IdTransform}
 * **minus `defaultQuery`**. Because `defaultQuery` is the only method that calls
 * `generate()`, callers who only need the read path are not forced to provide a
 * synchronous generator.
 *
 * The name reflects the provenance axis — this mapper does not generate IDs; it
 * parses and serialises a caller-supplied value. It is **not** read-only: the
 * return value includes a `write` method.
 *
 * @example
 * ```ts
 * import { idFieldNonGenerating } from "@smonn/ids/prisma";
 * import { createOpaqueTimestampId } from "@smonn/ids/opaque";
 *
 * const inv = createOpaqueTimestampId("inv", { key });
 * const invoiceIdField = idFieldNonGenerating(inv);
 *
 * const xprisma = prisma.$extends({
 *   result: {
 *     invoice: { id: invoiceIdField.computeField("id") },
 *   },
 * });
 * // xprisma.invoice.findUnique(…).id is typed as Id<"inv"> — no cast required
 * ```
 */
export function idFieldNonGenerating<Brand extends string>(
  codec: IdColumnCodec<Brand>,
): Omit<IdTransform<Brand>, "defaultQuery"> {
  return {
    read(value: unknown): Id<Brand> {
      return readIdColumn(codec, value);
    },
    readNullable(value: unknown): Id<Brand> | null {
      return readIdColumnNullable(codec, value);
    },
    write(value: Id<Brand>): string {
      return writeIdColumn(codec, value);
    },
    computeField(fieldName: string) {
      return {
        needs: { [fieldName]: true },
        compute: (model: Record<string, unknown>): Id<Brand> =>
          readIdColumn(codec, model[fieldName]),
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

/**
 * @deprecated Renamed to {@link idFieldNonGenerating}. Alias retained until 2.0.
 * Use `idFieldNonGenerating` for new code.
 */
export function idFieldReadOnly<Brand extends string>(
  codec: IdColumnCodec<Brand>,
): Omit<IdTransform<Brand>, "defaultQuery"> {
  return idFieldNonGenerating(codec);
}
