import {
  customType,
  type ConvertCustomConfig,
  type PgCustomColumnBuilder,
} from "drizzle-orm/pg-core";
import {
  customType as customTypeMysql,
  type ConvertCustomConfig as ConvertCustomConfigMysql,
  type MySqlCustomColumnBuilder,
} from "drizzle-orm/mysql-core";
import {
  customType as customTypeSqlite,
  type ConvertCustomConfig as ConvertCustomConfigSqlite,
  type SQLiteCustomColumnBuilder,
} from "drizzle-orm/sqlite-core";
import type { HasDefault, HasRuntimeDefault } from "drizzle-orm/column-builder";
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

function buildIdColumn<Brand extends string, Col>(
  columnFactory: (config: {
    dataType(): string;
    toDriver(value: Id<Brand>): string;
    fromDriver(value: string): Id<Brand>;
  }) => Col,
  codec: IdColumnCodec<Brand>,
  columnType: string,
): Col {
  return columnFactory({
    dataType() {
      return columnType;
    },
    toDriver(value: Id<Brand>): string {
      return writeIdColumn(codec, value);
    },
    fromDriver(value: string): Id<Brand> {
      return readIdColumn(codec, value);
    },
  });
}

function buildNullableIdColumn<Brand extends string, Col>(
  columnFactory: (config: {
    dataType(): string;
    toDriver(value: Id<Brand> | null | undefined): string | null;
    fromDriver(value: string | null): Id<Brand> | null;
  }) => Col,
  codec: IdColumnCodec<Brand>,
  columnType: string,
): Col {
  return columnFactory({
    dataType() {
      return columnType;
    },
    toDriver(value: Id<Brand> | null | undefined): string | null {
      return writeIdColumnNullable(codec, value);
    },
    fromDriver(value: string | null): Id<Brand> | null {
      return readIdColumnNullable(codec, value);
    },
  });
}

/**
 * Drizzle custom column type that stores an `Id<Brand>` as a canonical SQL string value in PostgreSQL.
 *
 * **Write path:** passes the `Id<Brand>` directly to the driver — it is already
 * the canonical string form.
 *
 * **Read path:** normalises the raw DB string via `codec.safeParse()`, not strict
 * `is()`. Data at rest should already be canonical per ADR-0003, but `safeParse`
 * is a safe boundary in case stale non-canonical values exist. Throws if the
 * value from the database does not parse as a valid `Id<Brand>`.
 *
 * @param codec - The brand-scoped codec used to parse values read from the database.
 * @param options - Optional column configuration.
 * @param options.columnType - SQL column type to use (default: `"text"`). Pass
 *   `"varchar(30)"` or `"char(26)"` to match an existing DDL or index strategy.
 *   The value is passed through verbatim — no validation is performed.
 *
 * @example
 * ```ts
 * import { idColumn } from "@smonn/ids/drizzle";
 * import { createTimestampId } from "@smonn/ids";
 *
 * const usr = createTimestampId("usr");
 * // default: text column
 * export const users = pgTable("users", { id: idColumn(usr).primaryKey() });
 * // explicit varchar column
 * export const orgs = pgTable("orgs", { id: idColumn(usr, { columnType: "varchar(30)" }).primaryKey() });
 * ```
 */
export function idColumn<Brand extends string>(
  codec: IdColumnCodec<Brand>,
  options?: { columnType?: string },
): PgCustomColumnBuilder<ConvertCustomConfig<"", { data: Id<Brand>; driverData: string }>> {
  return buildIdColumn(
    (config) => customType<{ data: Id<Brand>; driverData: string }>(config)(),
    codec,
    options?.columnType ?? "text",
  );
}

/**
 * Drizzle custom column type that stores an `Id<Brand>` as a canonical `text` value in MySQL.
 *
 * **Write path:** passes the `Id<Brand>` directly to the driver — it is already
 * the canonical string form.
 *
 * **Read path:** normalises the raw DB string via `codec.safeParse()`, not strict
 * `is()`. Throws `IdsError("invalid_id")` if the value from the database does not
 * parse as a valid `Id<Brand>`.
 *
 * @example
 * ```ts
 * import { idColumnMysql } from "@smonn/ids/drizzle";
 * import { createTimestampId } from "@smonn/ids";
 *
 * const usr = createTimestampId("usr");
 * export const users = mysqlTable("users", { id: idColumnMysql(usr).primaryKey() });
 * // users.id is Id<"usr"> end-to-end
 * ```
 */
export function idColumnMysql<Brand extends string>(
  codec: IdColumnCodec<Brand>,
): MySqlCustomColumnBuilder<ConvertCustomConfigMysql<"", { data: Id<Brand>; driverData: string }>> {
  return buildIdColumn(
    (config) => customTypeMysql<{ data: Id<Brand>; driverData: string }>(config)(),
    codec,
    "text",
  );
}

/**
 * Drizzle custom column type that stores an `Id<Brand>` as a canonical `text` value in SQLite.
 *
 * **Write path:** passes the `Id<Brand>` directly to the driver — it is already
 * the canonical string form.
 *
 * **Read path:** normalises the raw DB string via `codec.safeParse()`, not strict
 * `is()`. Throws `IdsError("invalid_id")` if the value from the database does not
 * parse as a valid `Id<Brand>`.
 *
 * @example
 * ```ts
 * import { idColumnSqlite } from "@smonn/ids/drizzle";
 * import { createTimestampId } from "@smonn/ids";
 *
 * const usr = createTimestampId("usr");
 * export const users = sqliteTable("users", { id: idColumnSqlite(usr).primaryKey() });
 * // users.id is Id<"usr"> end-to-end
 * ```
 */
export function idColumnSqlite<Brand extends string>(
  codec: IdColumnCodec<Brand>,
): SQLiteCustomColumnBuilder<
  ConvertCustomConfigSqlite<"", { data: Id<Brand>; driverData: string }>
> {
  return buildIdColumn(
    (config) => customTypeSqlite<{ data: Id<Brand>; driverData: string }>(config)(),
    codec,
    "text",
  );
}

/**
 * Drizzle custom column type for a **nullable** `Id<Brand>` column.
 *
 * Behaves identically to {@link idColumn} except that `null` and `undefined`
 * driver values are passed through as `null` rather than throwing. Use for
 * optional foreign keys, `LEFT JOIN` results, and any column that is
 * legitimately absent.
 *
 * **There is no `generatedNullableIdColumn`.** A column that auto-generates its own ID should
 * never be null at write time — that is the entire purpose of the generated variant. A nullable
 * column is one that the caller explicitly sets to `null`; it cannot simultaneously be
 * auto-generated. Use {@link nullableIdColumn} for optional foreign keys and {@link generatedIdColumn}
 * for primary keys that must always be present. The same reasoning applies to the MySQL and
 * SQLite equivalents ({@link nullableIdColumnMysql}, {@link nullableIdColumnSqlite}).
 *
 * @param codec - The brand-scoped codec used to parse values read from the database.
 * @param options - Optional column configuration.
 * @param options.columnType - SQL column type to use (default: `"text"`). Pass
 *   `"varchar(30)"` or `"char(26)"` to match an existing DDL or index strategy.
 *   The value is passed through verbatim — no validation is performed.
 *
 * @example
 * ```ts
 * import { nullableIdColumn } from "@smonn/ids/drizzle";
 * import { createTimestampId } from "@smonn/ids";
 *
 * const usr = createTimestampId("usr");
 * // default: text column
 * export const posts = pgTable("posts", {
 *   authorId: nullableIdColumn(usr),
 * });
 * // posts.authorId is Id<"usr"> | null end-to-end
 *
 * // explicit char column
 * export const comments = pgTable("comments", {
 *   authorId: nullableIdColumn(usr, { columnType: "char(26)" }),
 * });
 * ```
 */
export function nullableIdColumn<Brand extends string>(
  codec: IdColumnCodec<Brand>,
  options?: { columnType?: string },
): PgCustomColumnBuilder<
  ConvertCustomConfig<"", { data: Id<Brand> | null; driverData: string | null }>
> {
  return buildNullableIdColumn(
    (config) => customType<{ data: Id<Brand> | null; driverData: string | null }>(config)(),
    codec,
    options?.columnType ?? "text",
  );
}

/**
 * Drizzle custom column type for a **nullable** `Id<Brand>` column in MySQL.
 *
 * Behaves identically to {@link idColumnMysql} except that `null` and `undefined`
 * driver values are passed through as `null` rather than throwing. Use for
 * optional foreign keys, `LEFT JOIN` results, and any column that is
 * legitimately absent.
 *
 * Column type is always `text` and cannot be overridden in MySQL.
 *
 * @param codec - The brand-scoped codec used to parse values read from the database.
 *
 * @example
 * ```ts
 * import { nullableIdColumnMysql } from "@smonn/ids/drizzle";
 * import { createTimestampId } from "@smonn/ids";
 *
 * const usr = createTimestampId("usr");
 * export const posts = mysqlTable("posts", {
 *   authorId: nullableIdColumnMysql(usr),
 * });
 * // posts.authorId is Id<"usr"> | null end-to-end
 * ```
 */
export function nullableIdColumnMysql<Brand extends string>(
  codec: IdColumnCodec<Brand>,
): MySqlCustomColumnBuilder<
  ConvertCustomConfigMysql<"", { data: Id<Brand> | null; driverData: string | null }>
> {
  return buildNullableIdColumn(
    (config) => customTypeMysql<{ data: Id<Brand> | null; driverData: string | null }>(config)(),
    codec,
    "text",
  );
}

/**
 * Drizzle custom column type for a **nullable** `Id<Brand>` column in SQLite.
 *
 * Behaves identically to {@link idColumnSqlite} except that `null` and `undefined`
 * driver values are passed through as `null` rather than throwing. Use for
 * optional foreign keys, `LEFT JOIN` results, and any column that is
 * legitimately absent.
 *
 * Column type is always `text` and cannot be overridden in SQLite.
 *
 * @param codec - The brand-scoped codec used to parse values read from the database.
 *
 * @example
 * ```ts
 * import { nullableIdColumnSqlite } from "@smonn/ids/drizzle";
 * import { createTimestampId } from "@smonn/ids";
 *
 * const usr = createTimestampId("usr");
 * export const posts = sqliteTable("posts", {
 *   authorId: nullableIdColumnSqlite(usr),
 * });
 * // posts.authorId is Id<"usr"> | null end-to-end
 * ```
 */
export function nullableIdColumnSqlite<Brand extends string>(
  codec: IdColumnCodec<Brand>,
): SQLiteCustomColumnBuilder<
  ConvertCustomConfigSqlite<"", { data: Id<Brand> | null; driverData: string | null }>
> {
  return buildNullableIdColumn(
    (config) => customTypeSqlite<{ data: Id<Brand> | null; driverData: string | null }>(config)(),
    codec,
    "text",
  );
}

/**
 * Drizzle custom column type that stores an `Id<Brand>` as a canonical SQL string value
 * in PostgreSQL, with a client-side `.$defaultFn` so inserts that omit the field receive
 * a freshly generated ID automatically.
 *
 * **Write path:** `.$defaultFn(() => codec.generate())` is wired — if the field is absent
 * on insert, Drizzle calls `codec.generate()` to produce a new `Id<Brand>`.
 *
 * **Read path:** normalises the raw DB string via `codec.safeParse()`, not strict `is()`.
 * Throws `IdsError("invalid_id")` if the value from the database does not parse as a
 * valid `Id<Brand>`.
 *
 * Requires a codec that exposes synchronous `generate()` — see {@link IdGeneratingCodec}.
 * Only the **Timestamp codec** and **Reverse Timestamp codec** qualify; Opaque, Signed,
 * Wrapped, and Digest codecs are a compile-time error.
 *
 * @param codec - The brand-scoped codec used to generate and parse values.
 * @param options - Optional column configuration.
 * @param options.columnType - SQL column type to use (default: `"text"`). Pass
 *   `"varchar(30)"` or `"char(26)"` to match an existing DDL or index strategy.
 *   The value is passed through verbatim — no validation is performed.
 *
 * @example
 * ```ts
 * import { generatedIdColumn } from "@smonn/ids/drizzle";
 * import { createTimestampId } from "@smonn/ids";
 *
 * const usr = createTimestampId("usr");
 * export const users = pgTable("users", { id: generatedIdColumn(usr).primaryKey() });
 * // id is auto-filled on insert — no hand-supplied id needed
 * ```
 */
export function generatedIdColumn<Brand extends string>(
  codec: IdGeneratingCodec<Brand>,
  options?: { columnType?: string },
): HasRuntimeDefault<
  HasDefault<
    PgCustomColumnBuilder<ConvertCustomConfig<"", { data: Id<Brand>; driverData: string }>>
  >
> {
  return buildIdColumn(
    (config) => customType<{ data: Id<Brand>; driverData: string }>(config)(),
    codec,
    options?.columnType ?? "text",
  ).$defaultFn(() => codec.generate());
}

/**
 * Drizzle custom column type that stores an `Id<Brand>` as a canonical `text` value
 * in MySQL, with a client-side `.$defaultFn` so inserts that omit the field receive
 * a freshly generated ID automatically.
 *
 * **Write path:** `.$defaultFn(() => codec.generate())` is wired — if the field is absent
 * on insert, Drizzle calls `codec.generate()` to produce a new `Id<Brand>`.
 *
 * **Read path:** normalises the raw DB string via `codec.safeParse()`, not strict `is()`.
 * Throws `IdsError("invalid_id")` if the value from the database does not parse as a
 * valid `Id<Brand>`.
 *
 * Requires a codec that exposes synchronous `generate()` — see {@link IdGeneratingCodec}.
 * Only the **Timestamp codec** and **Reverse Timestamp codec** qualify; Opaque, Signed,
 * Wrapped, and Digest codecs are a compile-time error.
 *
 * @param codec - The brand-scoped codec used to generate and parse values.
 * @param options - Optional column configuration.
 * @param options.columnType - SQL column type to use (default: `"text"`). Pass
 *   `"varchar(30)"` or `"char(26)"` to match an existing DDL or index strategy.
 *   The value is passed through verbatim — no validation is performed.
 *
 * @example
 * ```ts
 * import { generatedIdColumnMysql } from "@smonn/ids/drizzle";
 * import { createTimestampId } from "@smonn/ids";
 *
 * const usr = createTimestampId("usr");
 * export const users = mysqlTable("users", { id: generatedIdColumnMysql(usr).primaryKey() });
 * // id is auto-filled on insert — no hand-supplied id needed
 * ```
 */
export function generatedIdColumnMysql<Brand extends string>(
  codec: IdGeneratingCodec<Brand>,
  options?: { columnType?: string },
): HasRuntimeDefault<
  HasDefault<
    MySqlCustomColumnBuilder<ConvertCustomConfigMysql<"", { data: Id<Brand>; driverData: string }>>
  >
> {
  return buildIdColumn(
    (config) => customTypeMysql<{ data: Id<Brand>; driverData: string }>(config)(),
    codec,
    options?.columnType ?? "text",
  ).$defaultFn(() => codec.generate());
}

/**
 * Drizzle custom column type that stores an `Id<Brand>` as a canonical `text` value
 * in SQLite, with a client-side `.$defaultFn` so inserts that omit the field receive
 * a freshly generated ID automatically.
 *
 * **Write path:** `.$defaultFn(() => codec.generate())` is wired — if the field is absent
 * on insert, Drizzle calls `codec.generate()` to produce a new `Id<Brand>`.
 *
 * **Read path:** normalises the raw DB string via `codec.safeParse()`, not strict `is()`.
 * Throws `IdsError("invalid_id")` if the value from the database does not parse as a
 * valid `Id<Brand>`.
 *
 * Requires a codec that exposes synchronous `generate()` — see {@link IdGeneratingCodec}.
 * Only the **Timestamp codec** and **Reverse Timestamp codec** qualify; Opaque, Signed,
 * Wrapped, and Digest codecs are a compile-time error.
 *
 * @param codec - The brand-scoped codec used to generate and parse values.
 * @param options - Optional column configuration.
 * @param options.columnType - SQL column type to use (default: `"text"`). Pass
 *   `"varchar(30)"` or `"char(26)"` to match an existing DDL or index strategy.
 *   The value is passed through verbatim — no validation is performed.
 *
 * @example
 * ```ts
 * import { generatedIdColumnSqlite } from "@smonn/ids/drizzle";
 * import { createTimestampId } from "@smonn/ids";
 *
 * const usr = createTimestampId("usr");
 * export const users = sqliteTable("users", { id: generatedIdColumnSqlite(usr).primaryKey() });
 * // id is auto-filled on insert — no hand-supplied id needed
 * ```
 */
export function generatedIdColumnSqlite<Brand extends string>(
  codec: IdGeneratingCodec<Brand>,
  options?: { columnType?: string },
): HasRuntimeDefault<
  HasDefault<
    SQLiteCustomColumnBuilder<
      ConvertCustomConfigSqlite<"", { data: Id<Brand>; driverData: string }>
    >
  >
> {
  return buildIdColumn(
    (config) => customTypeSqlite<{ data: Id<Brand>; driverData: string }>(config)(),
    codec,
    options?.columnType ?? "text",
  ).$defaultFn(() => codec.generate());
}
