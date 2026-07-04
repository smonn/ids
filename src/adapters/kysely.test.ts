import { fromAny } from "@total-typescript/shoehorn";
import { describe, expect, expectTypeOf, it, vi, afterAll, beforeAll } from "vitest";
import Database from "better-sqlite3";
import { Kysely, SqliteDialect } from "kysely";
import { createTimestampId } from "../codecs/timestamp/index.js";
import {
  idColumn,
  idPlugin,
  insertId,
  nullableIdColumn,
  IdsError,
  isIdsError,
  type IdColumnCodec,
  type IdColumnType,
  type IdGeneratingCodec,
  type NullableIdColumnType,
} from "./kysely.js";
import type { Id } from "../types.js";
import type { ColumnType, KyselyPlugin } from "kysely";
import { makeSpyCodec } from "./test-helpers.js";

describe("kysely", () => {
  let warnSilencer: ReturnType<typeof vi.spyOn>;
  beforeAll(() => {
    warnSilencer = vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterAll(() => {
    warnSilencer.mockRestore();
  });

  const usr = createTimestampId("usr", { allowDuplicateBrand: true });
  const org = createTimestampId("org", { allowDuplicateBrand: true });

  const usrCol = idColumn(usr);

  it("write path stores the canonical string", () => {
    const id = usr.generate();
    expect(usrCol.toDriver(id)).toBe(id);
    expectTypeOf(usrCol.toDriver(id)).toEqualTypeOf<string>();
  });

  it("write path rejects a cast-smuggled invalid string", () => {
    let err: unknown;
    try {
      usrCol.toDriver("not_an_id" as Id<"usr">);
    } catch (e) {
      err = e;
    }
    expect(isIdsError(err)).toBe(true);
    expect((err as IdsError).code).toBe("invalid_id");
  });

  it("read-back returns Id<Brand>", () => {
    const id = usr.generate();
    expect(usrCol.fromDriver(fromAny(id))).toBe(id);
    expectTypeOf(usrCol.fromDriver(fromAny(id))).toEqualTypeOf<Id<"usr">>();
  });

  it("brand round-trip typing — idColumn infers Brand from codec", () => {
    expectTypeOf(idColumn<"usr">)
      .parameter(0)
      .toMatchTypeOf<IdColumnCodec<"usr">>();
    expectTypeOf(usr).toMatchTypeOf<IdColumnCodec<"usr">>();
    const id = usr.generate();
    const fromDb = usrCol.fromDriver(fromAny(id));
    expect(fromDb).toBe(id);
  });

  it("IdColumnType is assignable to Kysely ColumnType", () => {
    expectTypeOf<IdColumnType<"usr">>().toMatchTypeOf<
      ColumnType<Id<"usr">, Id<"usr">, Id<"usr">>
    >();
  });

  it("rejects a wrong-brand value from DB", () => {
    const orgId = org.generate();
    let err: unknown;
    try {
      usrCol.fromDriver(fromAny(orgId));
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
      usrCol.fromDriver("usr_!!!!!!!!!!!!!!!!!!!!!!!!!!");
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
      usrCol.fromDriver(fromAny(undefined));
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

  describe("safeParse-only contract (spy codec)", () => {
    it("fromDriver calls only safeParse on the codec", () => {
      const spyCodec = makeSpyCodec("spy");
      idColumn(spyCodec).fromDriver("any_value");
      expect(spyCodec.safeParse).toHaveBeenCalled();
      expect(spyCodec.extractTimestamp).not.toHaveBeenCalled();
      expect(spyCodec.wrap).not.toHaveBeenCalled();
      expect(spyCodec.unwrap).not.toHaveBeenCalled();
    });
  });

  describe("idPlugin", () => {
    it("is exported and satisfies the KyselyPlugin interface", () => {
      expectTypeOf(idPlugin).toBeFunction();
      const plugin = idPlugin({ id: usr });
      expectTypeOf(plugin).toMatchTypeOf<KyselyPlugin>();
      expect(typeof plugin.transformQuery).toBe("function");
      expect(typeof plugin.transformResult).toBe("function");
    });

    it("transformQuery is a no-op identity pass-through", () => {
      const plugin = idPlugin({ id: usr });
      const fakeNode = fromAny({ kind: "SelectQueryNode" });
      const result = plugin.transformQuery(fromAny({ queryId: {}, node: fakeNode }));
      expect(result).toBe(fakeNode);
    });

    it("transformResult transforms a single matched column automatically", async () => {
      const id = usr.generate();
      const plugin = idPlugin({ id: usr });
      const result = await plugin.transformResult(
        fromAny({ queryId: {}, result: { rows: [{ id }] } }),
      );
      expect(result.rows[0]!.id).toBe(id);
      expectTypeOf(result.rows[0]!.id).toEqualTypeOf<unknown>();
    });

    it("transformResult transforms multiple codecs in one plugin", async () => {
      const usrId = usr.generate();
      const orgId = org.generate();
      const plugin = idPlugin({ id: usr, org_id: org });
      const result = await plugin.transformResult(
        fromAny({ queryId: {}, result: { rows: [{ id: usrId, org_id: orgId }] } }),
      );
      expect(result.rows[0]!.id).toBe(usrId);
      expect(result.rows[0]!.org_id).toBe(orgId);
    });

    it("transformResult throws IdsError with invalid_id when a matched column has an invalid value", async () => {
      const plugin = idPlugin({ id: usr });
      let err: unknown;
      try {
        await plugin.transformResult(
          fromAny({ queryId: {}, result: { rows: [{ id: "not-a-valid-usr-id" }] } }),
        );
      } catch (e) {
        err = e;
      }
      expect(isIdsError(err)).toBe(true);
      expect((err as IdsError).code).toBe("invalid_id");
    });

    it("transformResult passes through columns not in the map unchanged", async () => {
      const id = usr.generate();
      const plugin = idPlugin({ id: usr });
      const result = await plugin.transformResult(
        fromAny({ queryId: {}, result: { rows: [{ id, name: "Alice", count: 42 }] } }),
      );
      expect(result.rows[0]!.name).toBe("Alice");
      expect(result.rows[0]!.count).toBe(42);
    });

    it("transformResult preserves other QueryResult fields (numAffectedRows etc.)", async () => {
      const id = usr.generate();
      const plugin = idPlugin({ id: usr });
      const result = await plugin.transformResult(
        fromAny({ queryId: {}, result: { rows: [{ id }], numAffectedRows: 1n } }),
      );
      expect(result.numAffectedRows).toBe(1n);
    });

    it("throws at construction when a map key contains a dot", () => {
      expect(() => idPlugin({ "users.id": usr })).toThrowError('"users.id"');
    });

    it("transformResult returns the original result reference when no column matches the map", async () => {
      const plugin = idPlugin({ id: usr });
      const row = { name: "Alice", count: 42 };
      const inputResult = fromAny({ rows: [row] });
      const result = await plugin.transformResult(fromAny({ queryId: {}, result: inputResult }));
      expect(result).toBe(inputResult);
      expect(result.rows[0]).toBe(row);
    });

    it("transformResult returns the original result reference for an empty row set", async () => {
      const plugin = idPlugin({ id: usr });
      const inputResult = fromAny({ rows: [] });
      const result = await plugin.transformResult(fromAny({ queryId: {}, result: inputResult }));
      expect(result).toBe(inputResult);
    });

    it("wide row — only ID columns are rewritten, all non-ID columns are untouched", async () => {
      const id = usr.generate();
      const plugin = idPlugin({ id: usr });
      const extra = { nested: "obj" };
      const wideRow = {
        id,
        col1: "a",
        col2: 2,
        col3: true,
        col4: null,
        col5: extra,
        col6: "f",
        col7: "g",
        col8: "h",
        col9: "i",
        col10: "j",
      };
      const result = await plugin.transformResult(
        fromAny({ queryId: {}, result: { rows: [wideRow] } }),
      );
      const row = result.rows[0]!;
      expect(row.id).toBe(id);
      expect(row.col1).toBe("a");
      expect(row.col2).toBe(2);
      expect(row.col3).toBe(true);
      expect(row.col4).toBeNull();
      expect(row.col5).toBe(extra);
      expect(row.col6).toBe("f");
      expect(row.col7).toBe("g");
      expect(row.col8).toBe("h");
      expect(row.col9).toBe("i");
      expect(row.col10).toBe("j");
    });
  });

  describe("insertId", () => {
    it("returns a valid Id<Brand>", () => {
      const id = insertId(usr);
      expect(usr.is(id)).toBe(true);
      expectTypeOf(id).toEqualTypeOf<Id<"usr">>();
    });

    it("accepts a codec that satisfies IdGeneratingCodec", () => {
      expectTypeOf(usr).toMatchTypeOf<IdGeneratingCodec<"usr">>();
      expectTypeOf(insertId<"usr">)
        .parameter(0)
        .toMatchTypeOf<IdGeneratingCodec<"usr">>();
    });

    it("IdGeneratingCodec export matches the shape from prisma.ts", () => {
      type Expected = IdColumnCodec<"usr"> & { generate(): Id<"usr"> };
      expectTypeOf<IdGeneratingCodec<"usr">>().toMatchTypeOf<Expected>();
      expectTypeOf<Expected>().toMatchTypeOf<IdGeneratingCodec<"usr">>();
    });

    it("each call returns a fresh Id<Brand>", () => {
      const a = insertId(usr);
      const b = insertId(usr);
      expect(typeof a).toBe("string");
      expect(typeof b).toBe("string");
      expect(a).not.toBe(b);
    });
  });

  describe("nullableIdColumn", () => {
    const nullableUsrCol = nullableIdColumn(usr);

    it("null driver value → null", () => {
      expect(nullableUsrCol.fromDriver(fromAny(null))).toBeNull();
    });

    it("undefined driver value → null", () => {
      expect(nullableUsrCol.fromDriver(fromAny(undefined))).toBeNull();
    });

    it("valid string driver value → Id<Brand>", () => {
      const id = usr.generate();
      expect(nullableUsrCol.fromDriver(fromAny(id))).toBe(id);
      expectTypeOf(nullableUsrCol.fromDriver(fromAny(id))).toEqualTypeOf<Id<"usr"> | null>();
    });

    it("invalid string driver value → throws IdsError(invalid_id)", () => {
      let err: unknown;
      try {
        nullableUsrCol.fromDriver("usr_!!!!!!!!!!!!!!!!!!!!!!!!!!");
      } catch (e) {
        err = e;
      }
      expect(isIdsError(err)).toBe(true);
      expect((err as IdsError).code).toBe("invalid_id");
    });

    it("write path passes null through unchanged", () => {
      expect(nullableUsrCol.toDriver(null)).toBeNull();
      expectTypeOf(nullableUsrCol.toDriver(null)).toEqualTypeOf<string | null>();
    });

    it("write path normalises undefined to null", () => {
      expect(nullableUsrCol.toDriver(fromAny(undefined))).toBeNull();
    });

    it("write path passes Id<Brand> through as string", () => {
      const id = usr.generate();
      expect(nullableUsrCol.toDriver(id)).toBe(id);
    });

    it("write path rejects a cast-smuggled invalid string", () => {
      let err: unknown;
      try {
        nullableUsrCol.toDriver("not_an_id" as Id<"usr">);
      } catch (e) {
        err = e;
      }
      expect(isIdsError(err)).toBe(true);
      expect((err as IdsError).code).toBe("invalid_id");
    });

    it("NullableIdColumnType is assignable to Kysely ColumnType", () => {
      expectTypeOf<NullableIdColumnType<"usr">>().toMatchTypeOf<
        ColumnType<Id<"usr"> | null, Id<"usr"> | null, Id<"usr"> | null>
      >();
    });
  });
});

describe("kysely — SQLite integration", () => {
  let warnSilencer: ReturnType<typeof vi.spyOn>;
  beforeAll(() => {
    warnSilencer = vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterAll(() => {
    warnSilencer.mockRestore();
  });

  it("idColumn round-trips a generated Id through a :memory: BetterSQLite3 database", async () => {
    const codec = createTimestampId("kyl", { allowDuplicateBrand: true });
    const kyCol = idColumn(codec);

    interface KylDb {
      kyl_items: { id: string };
    }

    const sqliteDb = new Database(":memory:");
    const db = new Kysely<KylDb>({
      dialect: new SqliteDialect({ database: sqliteDb }),
    });

    await db.schema
      .createTable("kyl_items")
      .addColumn("id", "text", (c) => c.primaryKey().notNull())
      .execute();

    const id = insertId(codec);
    await db.insertInto("kyl_items").values({ id }).execute();

    const row = await db.selectFrom("kyl_items").select("id").executeTakeFirstOrThrow();
    const roundTripped = kyCol.fromDriver(row.id);
    expect(roundTripped).toBe(id);

    await db.destroy();
  });
});
