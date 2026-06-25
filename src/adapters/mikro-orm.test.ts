import { fromAny } from "@total-typescript/shoehorn";
import { describe, expect, expectTypeOf, it } from "vitest";
import { createTimestampId } from "../codecs/timestamp/index.js";
import { idType, IdsError, isIdsError, type IdColumnCodec } from "./mikro-orm.js";
import type { Id } from "../types.js";
import { Type } from "@mikro-orm/core";

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
});
