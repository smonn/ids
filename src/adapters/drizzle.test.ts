import { fromAny } from "@total-typescript/shoehorn";
import { afterAll, beforeAll, describe, expect, expectTypeOf, it, vi } from "vitest";
import { pgTable } from "drizzle-orm/pg-core";
import { mysqlTable } from "drizzle-orm/mysql-core";
import { sqliteTable } from "drizzle-orm/sqlite-core";
import { createTimestampId } from "../codecs/timestamp/index.js";
import {
  idColumn,
  idColumnMysql,
  idColumnSqlite,
  nullableIdColumn,
  IdsError,
  isIdsError,
  type IdColumnCodec,
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

    it("write path passes Id<Brand> through unchanged", () => {
      const id = usr.generate();
      expect(posts.authorId.mapToDriverValue(id)).toBe(id);
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
});
