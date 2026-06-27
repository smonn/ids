import { fromAny } from "@total-typescript/shoehorn";
import { afterAll, beforeAll, describe, expect, expectTypeOf, it, vi } from "vitest";
import { pgTable } from "drizzle-orm/pg-core";
import { mysqlTable } from "drizzle-orm/mysql-core";
import { sqliteTable } from "drizzle-orm/sqlite-core";
import { createTimestampId } from "../codecs/timestamp/index.js";
import { createReverseTimestampId } from "../codecs/reverse/index.js";
import type { OpaqueTimestampCodec } from "../codecs/opaque/index.js";
import type { SignedTimestampCodec } from "../codecs/signed/index.js";
import type { WrappedKeyCodec } from "../codecs/wrapped/index.js";
import type { DigestCodec } from "../codecs/digest/index.js";
import {
  idColumn,
  idColumnMysql,
  idColumnSqlite,
  nullableIdColumn,
  generatedIdColumn,
  generatedIdColumnMysql,
  generatedIdColumnSqlite,
  IdsError,
  isIdsError,
  type IdColumnCodec,
  type IdGeneratingCodec,
} from "./drizzle.js";
import type { Id } from "../types.js";
import { makeSpyCodec } from "./test-helpers.js";

describe("drizzle", () => {
  let warnSilencer: ReturnType<typeof vi.spyOn>;
  beforeAll(() => {
    warnSilencer = vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterAll(() => {
    warnSilencer.mockRestore();
  });

  const usr = createTimestampId("usr", { allowDuplicateBrand: true });
  const org = createTimestampId("org", { allowDuplicateBrand: true });

  const users = pgTable("users", { id: idColumn(usr) });

  it("write path stores the canonical string", () => {
    const id = usr.generate();
    expect(users.id.mapToDriverValue(id)).toBe(id);
  });

  it("read-back returns Id<Brand>", () => {
    const id = usr.generate();
    expect(users.id.mapFromDriverValue(fromAny(id))).toBe(id);
  });

  it("brand round-trip typing — idColumn infers Brand from codec", () => {
    // idColumn<"usr"> accepts IdColumnCodec<"usr"> and must reject IdColumnCodec<"org">
    expectTypeOf(idColumn<"usr">)
      .parameter(0)
      .toMatchTypeOf<IdColumnCodec<"usr">>();
    // IdColumnCodec shape is satisfied by any codec variant with safeParse
    expectTypeOf(usr).toMatchTypeOf<IdColumnCodec<"usr">>();
    // Prove Id<"usr"> is the data type of the column (compile-time assignability)
    const id = usr.generate();
    // Prove compile-time assignability: cast required because Drizzle pgTable
    // collapses custom column data types to unknown in its inference
    const fromDb: Id<"usr"> = fromAny(users.id.mapFromDriverValue(fromAny(id)));
    expect(fromDb).toBe(id);
  });

  it("rejects a wrong-brand value from DB", () => {
    const orgId = org.generate();
    let err: unknown;
    try {
      users.id.mapFromDriverValue(fromAny(orgId));
    } catch (e) {
      err = e;
    }
    expect(isIdsError(err)).toBe(true);
    expect((err as IdsError).code).toBe("invalid_id");
    expect((err as IdsError).cause).toBe("invalid_prefix");
  });

  it("rejects a malformed value from DB", () => {
    let err: unknown;
    try {
      // valid prefix, invalid base32 payload
      users.id.mapFromDriverValue("usr_!!!!!!!!!!!!!!!!!!!!!!!!!!");
    } catch (e) {
      err = e;
    }
    expect(isIdsError(err)).toBe(true);
    expect((err as IdsError).code).toBe("invalid_id");
    expect((err as IdsError).cause).toBe("invalid_base32");
  });

  it("rejects a non-string value from DB", () => {
    let err: unknown;
    try {
      users.id.mapFromDriverValue(fromAny(null));
    } catch (e) {
      err = e;
    }
    expect(isIdsError(err)).toBe(true);
    expect((err as IdsError).code).toBe("invalid_id");
    expect((err as IdsError).cause).toBe("not_string");
  });

  it("IdColumnCodec accepts any codec variant with safeParse", () => {
    // structural type check: TimestampCodec satisfies IdColumnCodec<Brand>
    expectTypeOf(usr).toMatchTypeOf<IdColumnCodec<"usr">>();
  });

  describe("safeParse-only contract (spy codec)", () => {
    it("mapFromDriverValue calls only safeParse on the codec", () => {
      const spyCodec = makeSpyCodec("spy");
      const tbl = pgTable("spy_users", { id: idColumn(spyCodec) });
      tbl.id.mapFromDriverValue("any_value");
      expect(spyCodec.safeParse).toHaveBeenCalled();
      expect(spyCodec.extractTimestamp).not.toHaveBeenCalled();
      expect(spyCodec.wrap).not.toHaveBeenCalled();
      expect(spyCodec.unwrap).not.toHaveBeenCalled();
    });
  });

  describe("columnType option", () => {
    it("getSQLType defaults to 'text' with no options (backward compat)", () => {
      const tbl = pgTable("usr_default_col_type", { id: idColumn(usr) });
      expect(tbl.id.getSQLType()).toBe("text");
    });

    it("getSQLType returns the provided columnType", () => {
      const tbl = pgTable("usr_varchar_col_type", {
        id: idColumn(usr, { columnType: "varchar(30)" }),
      });
      expect(tbl.id.getSQLType()).toBe("varchar(30)");
    });

    it("write path is unaffected by columnType option", () => {
      const tbl = pgTable("usr_varchar_write", {
        id: idColumn(usr, { columnType: "varchar(30)" }),
      });
      const id = usr.generate();
      expect(tbl.id.mapToDriverValue(id)).toBe(id);
    });

    it("read path is unaffected by columnType option", () => {
      const tbl = pgTable("usr_varchar_read", { id: idColumn(usr, { columnType: "varchar(30)" }) });
      const id = usr.generate();
      expect(tbl.id.mapFromDriverValue(fromAny(id))).toBe(id);
    });

    it("accepts columnType as an optional string in its type signature", () => {
      expectTypeOf(idColumn<"usr">)
        .parameter(1)
        .toMatchTypeOf<{ columnType?: string } | undefined>();
    });
  });

  describe("IdGeneratingCodec", () => {
    const timestampCodec = createTimestampId("usr", { allowDuplicateBrand: true });
    const reverseTimestampCodec = createReverseTimestampId("usr", { allowDuplicateBrand: true });

    it("createTimestampId satisfies IdGeneratingCodec", () => {
      expectTypeOf(timestampCodec).toMatchTypeOf<IdGeneratingCodec<"usr">>();
    });

    it("createReverseTimestampId satisfies IdGeneratingCodec", () => {
      expectTypeOf(reverseTimestampCodec).toMatchTypeOf<IdGeneratingCodec<"usr">>();
    });

    it("a codec without generate does not satisfy IdGeneratingCodec", () => {
      const minimalCodec = {
        safeParse: (_value: unknown) => ({ ok: false as const, error: "not_string" as const }),
      };
      expectTypeOf(minimalCodec).not.toMatchTypeOf<IdGeneratingCodec<"usr">>();
    });

    it("OpaqueTimestampCodec does not satisfy IdGeneratingCodec (async generate)", () => {
      expectTypeOf<OpaqueTimestampCodec<"usr">>().not.toMatchTypeOf<IdGeneratingCodec<"usr">>();
    });

    it("SignedTimestampCodec does not satisfy IdGeneratingCodec (async generate)", () => {
      expectTypeOf<SignedTimestampCodec<"usr">>().not.toMatchTypeOf<IdGeneratingCodec<"usr">>();
    });

    it("WrappedKeyCodec does not satisfy IdGeneratingCodec (no generate)", () => {
      expectTypeOf<WrappedKeyCodec<"usr", "u32">>().not.toMatchTypeOf<IdGeneratingCodec<"usr">>();
    });

    it("DigestCodec does not satisfy IdGeneratingCodec (no generate)", () => {
      expectTypeOf<DigestCodec<"usr">>().not.toMatchTypeOf<IdGeneratingCodec<"usr">>();
    });
  });

  describe("generatedIdColumn", () => {
    it("wires .$defaultFn and returns a PgCustomColumnBuilder", () => {
      const col = generatedIdColumn(usr);
      expect(col).toBeDefined();
      expectTypeOf(col.$defaultFn).toBeFunction();
    });

    it("defaultFn generates a valid Id<Brand> when called", () => {
      const col = generatedIdColumn(usr);
      const defaultFn = fromAny<{ config?: { defaultFn?: () => unknown } }, unknown>(col).config
        ?.defaultFn;
      expect(typeof defaultFn).toBe("function");
      const generated = defaultFn?.();
      expect(usr.safeParse(generated).ok).toBe(true);
    });

    it("read path normalises via safeParse", () => {
      const tbl = pgTable("gen_users", { id: generatedIdColumn(usr) });
      const id = usr.generate();
      expect(tbl.id.mapFromDriverValue(fromAny(id))).toBe(id);
    });

    it("write path passes Id<Brand> through unchanged", () => {
      const tbl = pgTable("gen_users_write", { id: generatedIdColumn(usr) });
      const id = usr.generate();
      expect(tbl.id.mapToDriverValue(id)).toBe(id);
    });

    it("getSQLType defaults to 'text'", () => {
      const tbl = pgTable("gen_users_text", { id: generatedIdColumn(usr) });
      expect(tbl.id.getSQLType()).toBe("text");
    });

    it("accepts columnType option", () => {
      const tbl = pgTable("gen_users_varchar", {
        id: generatedIdColumn(usr, { columnType: "varchar(30)" }),
      });
      expect(tbl.id.getSQLType()).toBe("varchar(30)");
    });
  });

  describe("nullableIdColumn", () => {
    const posts = pgTable("posts", { authorId: nullableIdColumn(usr) });

    it("null driver value → null", () => {
      expect(posts.authorId.mapFromDriverValue(fromAny(null))).toBeNull();
    });

    it("undefined driver value → null", () => {
      expect(posts.authorId.mapFromDriverValue(fromAny(undefined))).toBeNull();
    });

    it("valid string driver value → Id<Brand>", () => {
      const id = usr.generate();
      expect(posts.authorId.mapFromDriverValue(fromAny(id))).toBe(id);
    });

    it("invalid string driver value → throws IdsError(invalid_id)", () => {
      let err: unknown;
      try {
        posts.authorId.mapFromDriverValue(fromAny("usr_!!!!!!!!!!!!!!!!!!!!!!!!!!"));
      } catch (e) {
        err = e;
      }
      expect(isIdsError(err)).toBe(true);
      expect((err as IdsError).code).toBe("invalid_id");
    });

    it("write path passes null through unchanged", () => {
      expect(posts.authorId.mapToDriverValue(fromAny(null))).toBeNull();
    });

    it("write path normalises undefined to null", () => {
      expect(posts.authorId.mapToDriverValue(fromAny(undefined))).toBeNull();
    });

    it("write path passes Id<Brand> through unchanged", () => {
      const id = usr.generate();
      expect(posts.authorId.mapToDriverValue(id)).toBe(id);
    });

    it("getSQLType defaults to 'text' with no options (backward compat)", () => {
      expect(posts.authorId.getSQLType()).toBe("text");
    });

    describe("columnType option", () => {
      it("getSQLType returns the provided columnType", () => {
        const charPosts = pgTable("char_posts", {
          authorId: nullableIdColumn(usr, { columnType: "char(26)" }),
        });
        expect(charPosts.authorId.getSQLType()).toBe("char(26)");
      });

      it("accepts columnType as an optional string in its type signature", () => {
        expectTypeOf(nullableIdColumn<"usr">)
          .parameter(1)
          .toMatchTypeOf<{ columnType?: string } | undefined>();
      });

      it("write path is unaffected by columnType option", () => {
        const charPosts = pgTable("char_posts_write", {
          authorId: nullableIdColumn(usr, { columnType: "char(26)" }),
        });
        const id = usr.generate();
        expect(charPosts.authorId.mapToDriverValue(id)).toBe(id);
      });

      it("read path is unaffected by columnType option", () => {
        const charPosts = pgTable("char_posts_read", {
          authorId: nullableIdColumn(usr, { columnType: "char(26)" }),
        });
        const id = usr.generate();
        expect(charPosts.authorId.mapFromDriverValue(fromAny(id))).toBe(id);
      });
    });
  });
});

describe("drizzle — MySQL", () => {
  let warnSilencer: ReturnType<typeof vi.spyOn>;
  beforeAll(() => {
    warnSilencer = vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterAll(() => {
    warnSilencer.mockRestore();
  });

  const usr = createTimestampId("usr", { allowDuplicateBrand: true });
  const org = createTimestampId("org", { allowDuplicateBrand: true });

  const users = mysqlTable("users", { id: idColumnMysql(usr) });

  it("write path stores the canonical string", () => {
    const id = usr.generate();
    expect(users.id.mapToDriverValue(id)).toBe(id);
  });

  it("read-back returns Id<Brand>", () => {
    const id = usr.generate();
    expect(users.id.mapFromDriverValue(fromAny(id))).toBe(id);
  });

  it("rejects a wrong-brand value from DB", () => {
    const orgId = org.generate();
    let err: unknown;
    try {
      users.id.mapFromDriverValue(fromAny(orgId));
    } catch (e) {
      err = e;
    }
    expect(isIdsError(err)).toBe(true);
    expect((err as IdsError).code).toBe("invalid_id");
    expect((err as IdsError).cause).toBe("invalid_prefix");
  });

  it("rejects a malformed value from DB", () => {
    let err: unknown;
    try {
      users.id.mapFromDriverValue("usr_!!!!!!!!!!!!!!!!!!!!!!!!!!");
    } catch (e) {
      err = e;
    }
    expect(isIdsError(err)).toBe(true);
    expect((err as IdsError).code).toBe("invalid_id");
    expect((err as IdsError).cause).toBe("invalid_base32");
  });

  it("rejects a non-string value from DB", () => {
    let err: unknown;
    try {
      users.id.mapFromDriverValue(fromAny(null));
    } catch (e) {
      err = e;
    }
    expect(isIdsError(err)).toBe(true);
    expect((err as IdsError).code).toBe("invalid_id");
    expect((err as IdsError).cause).toBe("not_string");
  });

  it("IdColumnCodec accepts any codec variant with safeParse", () => {
    expectTypeOf(usr).toMatchTypeOf<IdColumnCodec<"usr">>();
  });

  describe("generatedIdColumnMysql", () => {
    it("wires .$defaultFn and returns a MySqlCustomColumnBuilder", () => {
      const col = generatedIdColumnMysql(usr);
      expect(col).toBeDefined();
      expectTypeOf(col.$defaultFn).toBeFunction();
    });

    it("defaultFn generates a valid Id<Brand> when called", () => {
      const col = generatedIdColumnMysql(usr);
      const defaultFn = fromAny<{ config?: { defaultFn?: () => unknown } }, unknown>(col).config
        ?.defaultFn;
      expect(typeof defaultFn).toBe("function");
      const generated = defaultFn?.();
      expect(usr.safeParse(generated).ok).toBe(true);
    });

    it("read path normalises via safeParse", () => {
      const tbl = mysqlTable("gen_users", { id: generatedIdColumnMysql(usr) });
      const id = usr.generate();
      expect(tbl.id.mapFromDriverValue(fromAny(id))).toBe(id);
    });

    it("write path passes Id<Brand> through unchanged", () => {
      const tbl = mysqlTable("gen_users_write", { id: generatedIdColumnMysql(usr) });
      const id = usr.generate();
      expect(tbl.id.mapToDriverValue(id)).toBe(id);
    });
  });
});

describe("drizzle — SQLite", () => {
  let warnSilencer: ReturnType<typeof vi.spyOn>;
  beforeAll(() => {
    warnSilencer = vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterAll(() => {
    warnSilencer.mockRestore();
  });

  const usr = createTimestampId("usr", { allowDuplicateBrand: true });
  const org = createTimestampId("org", { allowDuplicateBrand: true });

  const users = sqliteTable("users", { id: idColumnSqlite(usr) });

  it("write path stores the canonical string", () => {
    const id = usr.generate();
    expect(users.id.mapToDriverValue(id)).toBe(id);
  });

  it("read-back returns Id<Brand>", () => {
    const id = usr.generate();
    expect(users.id.mapFromDriverValue(fromAny(id))).toBe(id);
  });

  it("rejects a wrong-brand value from DB", () => {
    const orgId = org.generate();
    let err: unknown;
    try {
      users.id.mapFromDriverValue(fromAny(orgId));
    } catch (e) {
      err = e;
    }
    expect(isIdsError(err)).toBe(true);
    expect((err as IdsError).code).toBe("invalid_id");
    expect((err as IdsError).cause).toBe("invalid_prefix");
  });

  it("rejects a malformed value from DB", () => {
    let err: unknown;
    try {
      users.id.mapFromDriverValue("usr_!!!!!!!!!!!!!!!!!!!!!!!!!!");
    } catch (e) {
      err = e;
    }
    expect(isIdsError(err)).toBe(true);
    expect((err as IdsError).code).toBe("invalid_id");
    expect((err as IdsError).cause).toBe("invalid_base32");
  });

  it("rejects a non-string value from DB", () => {
    let err: unknown;
    try {
      users.id.mapFromDriverValue(fromAny(null));
    } catch (e) {
      err = e;
    }
    expect(isIdsError(err)).toBe(true);
    expect((err as IdsError).code).toBe("invalid_id");
    expect((err as IdsError).cause).toBe("not_string");
  });

  it("IdColumnCodec accepts any codec variant with safeParse", () => {
    expectTypeOf(usr).toMatchTypeOf<IdColumnCodec<"usr">>();
  });

  describe("generatedIdColumnSqlite", () => {
    it("wires .$defaultFn and returns a SQLiteCustomColumnBuilder", () => {
      const col = generatedIdColumnSqlite(usr);
      expect(col).toBeDefined();
      expectTypeOf(col.$defaultFn).toBeFunction();
    });

    it("defaultFn generates a valid Id<Brand> when called", () => {
      const col = generatedIdColumnSqlite(usr);
      const defaultFn = fromAny<{ config?: { defaultFn?: () => unknown } }, unknown>(col).config
        ?.defaultFn;
      expect(typeof defaultFn).toBe("function");
      const generated = defaultFn?.();
      expect(usr.safeParse(generated).ok).toBe(true);
    });

    it("read path normalises via safeParse", () => {
      const tbl = sqliteTable("gen_users", { id: generatedIdColumnSqlite(usr) });
      const id = usr.generate();
      expect(tbl.id.mapFromDriverValue(fromAny(id))).toBe(id);
    });

    it("write path passes Id<Brand> through unchanged", () => {
      const tbl = sqliteTable("gen_users_write", { id: generatedIdColumnSqlite(usr) });
      const id = usr.generate();
      expect(tbl.id.mapToDriverValue(id)).toBe(id);
    });
  });
});
