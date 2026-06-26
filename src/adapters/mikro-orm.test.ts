import { fromAny } from "@total-typescript/shoehorn";
import { describe, expect, expectTypeOf, it } from "vitest";
import { createTimestampId } from "../codecs/timestamp/index.js";
import { idType, nullableIdType, IdsError, isIdsError, type IdColumnCodec } from "./mikro-orm.js";
import type { Id } from "../types.js";
import { Type } from "@mikro-orm/core";
import { makeSpyCodec } from "./test-helpers.js";

describe("mikro-orm", () => {
  const usr = createTimestampId("usr", { allowDuplicateBrand: true });
  const org = createTimestampId("org", { allowDuplicateBrand: true });

  const UsrType = idType(usr);
  const instance = new UsrType();

  it("idType returns a class that extends Type", () => {
    expect(instance).toBeInstanceOf(Type);
  });

  it("write path stores the canonical string (identity pass-through)", () => {
    const id = usr.generate();
    expect(instance.convertToDatabaseValue(id, undefined as never)).toBe(id);
  });

  it("read-back returns Id<Brand>", () => {
    const id = usr.generate();
    expect(instance.convertToJSValue(fromAny(id), undefined as never)).toBe(id);
  });

  it("getColumnType returns text", () => {
    expect(instance.getColumnType(undefined as never, undefined as never)).toBe("text");
  });

  it("brand round-trip typing — idType infers Brand from codec", () => {
    expectTypeOf(idType<"usr">)
      .parameter(0)
      .toMatchTypeOf<IdColumnCodec<"usr">>();
    expectTypeOf(usr).toMatchTypeOf<IdColumnCodec<"usr">>();
    const id = usr.generate();
    const fromDb = instance.convertToJSValue(fromAny(id), undefined as never);
    expectTypeOf(fromDb).toEqualTypeOf<Id<"usr">>();
    expect(fromDb).toBe(id);
  });

  it("IdColumnCodec accepts any codec variant with safeParse", () => {
    expectTypeOf(usr).toMatchTypeOf<IdColumnCodec<"usr">>();
  });

  it("rejects a wrong-brand value from DB", () => {
    const orgId = org.generate();
    let err: unknown;
    try {
      instance.convertToJSValue(fromAny(orgId), undefined as never);
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
      instance.convertToJSValue(fromAny("usr_!!!!!!!!!!!!!!!!!!!!!!!!!!"), undefined as never);
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
      instance.convertToJSValue(fromAny(null), undefined as never);
    } catch (e) {
      err = e;
    }
    expect(isIdsError(err)).toBe(true);
    expect((err as IdsError).code).toBe("invalid_id");
    expect((err as IdsError).cause).toBe("not_string");
  });

  describe("safeParse-only contract (spy codec)", () => {
    it("convertToJSValue calls only safeParse on the codec", () => {
      const spyCodec = makeSpyCodec("spy");
      const SpyType = idType(spyCodec);
      new SpyType().convertToJSValue("any_value", undefined as never);
      expect(spyCodec.safeParse).toHaveBeenCalled();
      expect(spyCodec.extractTimestamp).not.toHaveBeenCalled();
      expect(spyCodec.wrap).not.toHaveBeenCalled();
      expect(spyCodec.unwrap).not.toHaveBeenCalled();
    });
  });

  describe("columnType option", () => {
    it("getColumnType defaults to 'text' with no options (backward compat)", () => {
      const DefaultType = idType(usr);
      expect(new DefaultType().getColumnType(undefined as never, undefined as never)).toBe("text");
    });

    it("getColumnType returns the provided columnType", () => {
      const VarcharType = idType(usr, { columnType: "varchar(30)" });
      expect(new VarcharType().getColumnType(undefined as never, undefined as never)).toBe(
        "varchar(30)",
      );
    });

    it("write path is unaffected by columnType option", () => {
      const VarcharType = idType(usr, { columnType: "varchar(30)" });
      const id = usr.generate();
      expect(new VarcharType().convertToDatabaseValue(id, undefined as never)).toBe(id);
    });

    it("read path is unaffected by columnType option", () => {
      const VarcharType = idType(usr, { columnType: "varchar(30)" });
      const id = usr.generate();
      expect(new VarcharType().convertToJSValue(fromAny(id), undefined as never)).toBe(id);
    });

    it("accepts columnType as an optional string in its type signature", () => {
      expectTypeOf(idType<"usr">)
        .parameter(1)
        .toMatchTypeOf<{ columnType?: string } | undefined>();
    });
  });

  describe("nullableIdType", () => {
    const NullableUsrType = nullableIdType(usr);
    const nullableInstance = new NullableUsrType();

    it("nullableIdType returns a class that extends Type", () => {
      expect(nullableInstance).toBeInstanceOf(Type);
    });

    it("null driver value → null", () => {
      expect(nullableInstance.convertToJSValue(fromAny(null), undefined as never)).toBeNull();
    });

    it("undefined driver value → null", () => {
      expect(nullableInstance.convertToJSValue(fromAny(undefined), undefined as never)).toBeNull();
    });

    it("valid string driver value → Id<Brand>", () => {
      const id = usr.generate();
      expect(nullableInstance.convertToJSValue(fromAny(id), undefined as never)).toBe(id);
    });

    it("invalid string driver value → throws IdsError(invalid_id)", () => {
      let err: unknown;
      try {
        nullableInstance.convertToJSValue(
          fromAny("usr_!!!!!!!!!!!!!!!!!!!!!!!!!!"),
          undefined as never,
        );
      } catch (e) {
        err = e;
      }
      expect(isIdsError(err)).toBe(true);
      expect((err as IdsError).code).toBe("invalid_id");
    });

    it("write path passes null through unchanged", () => {
      expect(nullableInstance.convertToDatabaseValue(fromAny(null), undefined as never)).toBeNull();
    });

    it("write path passes Id<Brand> through as string", () => {
      const id = usr.generate();
      expect(nullableInstance.convertToDatabaseValue(id, undefined as never)).toBe(id);
    });

    it("getColumnType returns text", () => {
      expect(nullableInstance.getColumnType(undefined as never, undefined as never)).toBe("text");
    });
  });
});
