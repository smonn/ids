import { fromAny } from "@total-typescript/shoehorn";
import { describe, expect, expectTypeOf, it, vi, afterAll, beforeAll } from "vitest";
import { createTimestampId } from "../codecs/timestamp/index.js";
import {
  idColumn,
  idPlugin,
  IdsError,
  isIdsError,
  type IdColumnCodec,
  type IdColumnType,
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

    it("supports table.column qualified names — matches by the column-name part", async () => {
      const id = usr.generate();
      const plugin = idPlugin({ "users.id": usr });
      const result = await plugin.transformResult(
        fromAny({ queryId: {}, result: { rows: [{ id }] } }),
      );
      expect(result.rows[0]!.id).toBe(id);
    });

    it("qualified key takes precedence over a plain key for the same column name", async () => {
      const usrId = usr.generate();
      // "users.id" (qualified) wins over "id" (plain) for column "id"; usrId parses via usr codec
      const plugin = idPlugin({ id: org, "users.id": usr });
      const result = await plugin.transformResult(
        fromAny({ queryId: {}, result: { rows: [{ id: usrId }] } }),
      );
      expect(result.rows[0]!.id).toBe(usrId);
    });
  });
});
