import { fromAny } from "@total-typescript/shoehorn";
import { describe, expect, expectTypeOf, it, vi, afterAll, beforeAll } from "vitest";
import { createTimestampId } from "../codecs/timestamp/index.js";
import {
  idColumn,
  nullableIdColumn,
  IdsError,
  isIdsError,
  type IdColumnCodec,
  type IdColumnType,
  type NullableIdColumnType,
} from "./kysely.js";
import type { Id } from "../types.js";
import type { ColumnType } from "kysely";
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

    it("write path passes Id<Brand> through as string", () => {
      const id = usr.generate();
      expect(nullableUsrCol.toDriver(id)).toBe(id);
    });

    it("NullableIdColumnType is assignable to Kysely ColumnType", () => {
      expectTypeOf<NullableIdColumnType<"usr">>().toMatchTypeOf<
        ColumnType<Id<"usr"> | null, Id<"usr"> | null, Id<"usr"> | null>
      >();
    });
  });
});
