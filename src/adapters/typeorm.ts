import type { ValueTransformer } from "typeorm";
import {
  readIdColumn,
  readIdColumnNullable,
  writeIdColumn,
  writeIdColumnNullable,
  type IdColumnCodec,
} from "./adapter-types.js";
import type { Id } from "../types.js";

/** {@link IdsError} class, {@link isIdsError} type guard, and {@link IdsErrorCode} union — re-exported from `"@smonn/ids"` for convenience. */
export { IdsError, isIdsError, type IdsErrorCode } from "../error.js";

export type { IdColumnCodec };

/**
 * Extension of {@link IdColumnCodec} that also exposes synchronous `generate()`.
 * Required by {@link beforeInsertHook} so that the hook can produce IDs at insert
 * time. Every full codec variant (Timestamp, Reverse Timestamp) satisfies this;
 * async-generate codecs (Opaque, Signed, Wrapped, Digest) do not and are therefore
 * unsupported by `beforeInsertHook`.
 */
export type IdGeneratingCodec<Brand extends string> = IdColumnCodec<Brand> & {
  generate(): Id<Brand>;
};

/**
 * TypeORM column transformer for `Id<Brand>`.
 *
 * Returns a `ValueTransformer` object suitable for use in a TypeORM `@Column`
 * decorator's `transformer` option.
 *
 * **Write path (`to`):** passes the `Id<Brand>` directly to the database — it is
 * already the canonical string form.
 *
 * **Read path (`from`):** normalises the raw database value via `codec.safeParse()`.
 * Throws `IdsError` with code `"invalid_id"` if the value does not parse as a valid
 * `Id<Brand>`.
 *
 * **TypeORM branding caveat:** TypeORM cannot brand a generated entity field type at
 * the schema level. Annotate the entity field explicitly: `id!: Id<"usr">`.
 *
 * @example
 * ```ts
 * import { idTransformer } from "@smonn/ids/typeorm";
 * import { createTimestampId } from "@smonn/ids";
 * import type { Id } from "@smonn/ids";
 * import { Column, Entity } from "typeorm";
 *
 * const usr = createTimestampId("usr");
 *
 * @Entity()
 * class User {
 *   @Column({ type: "text", transformer: idTransformer(usr) })
 *   id!: Id<"usr">;
 * }
 * ```
 */
export function idTransformer<Brand extends string>(codec: IdColumnCodec<Brand>): ValueTransformer {
  return {
    to(value: Id<Brand>): string {
      return writeIdColumn(value);
    },
    from(value: unknown): Id<Brand> {
      return readIdColumn(codec, value);
    },
  };
}

/**
 * Returns a function suitable for use inside a TypeORM `@BeforeInsert()` lifecycle
 * hook that auto-generates an `Id<Brand>` for `fieldName` when the field is absent
 * (`null` or `undefined`) on the entity at insert time. If the field already has a
 * value it is left unchanged.
 *
 * Requires a codec variant that exposes a synchronous `generate()` — see
 * {@link IdGeneratingCodec}. Only the **Timestamp codec** and **Reverse Timestamp
 * codec** qualify; passing an async-generate codec (Opaque, Signed, Wrapped, Digest)
 * is a **compile-time type error**.
 *
 * Pair with {@link idTransformer} on the same column: `idTransformer` handles the
 * read/write path; `beforeInsertHook` handles generation.
 *
 * @example
 * ```ts
 * import { idTransformer, beforeInsertHook } from "@smonn/ids/typeorm";
 * import { createTimestampId } from "@smonn/ids";
 * import type { Id } from "@smonn/ids";
 * import { BeforeInsert, Column, Entity } from "typeorm";
 *
 * const usr = createTimestampId("usr");
 * const fillUserId = beforeInsertHook("id", usr);
 *
 * @Entity()
 * class User {
 *   @Column({ type: "text", transformer: idTransformer(usr) })
 *   id!: Id<"usr">;
 *
 *   @BeforeInsert()
 *   generateId() {
 *     fillUserId(this);
 *   }
 * }
 * ```
 *
 * @remarks
 * **Gating rule:** `beforeInsertHook` requires a synchronous `generate()` codec
 * (`IdGeneratingCodec`). Async-generate codecs — Opaque Timestamp, Signed Timestamp,
 * Wrapped key, and Digest — do not satisfy `IdGeneratingCodec` and cannot be passed
 * here. TypeORM `@BeforeInsert` can be async, but synchronous generation keeps the
 * hook ergonomic and matches the full Prisma parity shape.
 *
 * **Read/write path:** Use {@link idTransformer} on the column for database
 * read/write transforms. `beforeInsertHook` only handles the generation step — it
 * does not replace the transformer.
 */
export function beforeInsertHook<Brand extends string>(
  fieldName: string,
  codec: IdGeneratingCodec<Brand>,
): (entity: Record<string, unknown>) => void {
  return function (entity: Record<string, unknown>): void {
    if (entity[fieldName] == null) {
      entity[fieldName] = codec.generate();
    }
  };
}

/**
 * TypeORM column transformer for a **nullable** `Id<Brand>` column.
 *
 * Behaves like {@link idTransformer} but `from` returns `null` for `null` /
 * `undefined` database values and `to` passes `null` / `undefined` through
 * unchanged. Use for optional foreign keys.
 *
 * @example
 * ```ts
 * import { nullableIdTransformer } from "@smonn/ids/typeorm";
 * import { createTimestampId } from "@smonn/ids";
 * import type { Id } from "@smonn/ids";
 * import { Column, Entity } from "typeorm";
 *
 * const usr = createTimestampId("usr");
 *
 * @Entity()
 * class Post {
 *   @Column({ type: "text", nullable: true, transformer: nullableIdTransformer(usr) })
 *   authorId!: Id<"usr"> | null;
 * }
 * ```
 */
export function nullableIdTransformer<Brand extends string>(
  codec: IdColumnCodec<Brand>,
): ValueTransformer {
  return {
    to(value: Id<Brand> | null | undefined): string | null {
      return writeIdColumnNullable(value);
    },
    from(value: unknown): Id<Brand> | null {
      return readIdColumnNullable(codec, value);
    },
  };
}
