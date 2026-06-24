import { describe, expect, expectTypeOf, it } from "vitest";
import { createTimestampId } from "../codecs/timestamp/index.js";
import { idTransformer, IdsError, isIdsError, type IdColumnCodec } from "./typeorm.js";
import type { Id } from "../types.js";

describe("typeorm", () => {
  const usr = createTimestampId("usr", { allowDuplicateBrand: true });
  const org = createTimestampId("org", { allowDuplicateBrand: true });

  const transformer = idTransformer(usr);

  it("write path stores the canonical string", () => {
    const id = usr.generate();
    expect(transformer.to(id)).toBe(id);
  });

  it("write path returns the value unchanged (identity)", () => {
    const id = usr.generate();
    expectTypeOf(transformer.to).toBeFunction();
    expect(transformer.to(id)).toStrictEqual(id);
  });

  it("read-back returns Id<Brand>", () => {
    const id = usr.generate();
    expect(transformer.from(id)).toBe(id);
  });

  it("brand round-trip typing — idTransformer infers Brand from codec", () => {
    expectTypeOf(idTransformer<"usr">)
      .parameter(0)
      .toMatchTypeOf<IdColumnCodec<"usr">>();
    expectTypeOf(usr).toMatchTypeOf<IdColumnCodec<"usr">>();
  });

  it("IdColumnCodec accepts any codec variant with safeParse", () => {
    expectTypeOf(usr).toMatchTypeOf<IdColumnCodec<"usr">>();
  });

  it("rejects a wrong-brand value from DB", () => {
    const orgId = org.generate();
    let err: unknown;
    try {
      transformer.from(orgId);
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
      transformer.from("usr_!!!!!!!!!!!!!!!!!!!!!!!!!!");
    } catch (e) {
      err = e;
    }
    expect(isIdsError(err)).toBe(true);
    expect((err as IdsError).code).toBe("invalid_id");
    expect((err as IdsError).cause).toBe("invalid_base32");
  });

  it("rejects null from DB", () => {
    let err: unknown;
    try {
      transformer.from(null);
    } catch (e) {
      err = e;
    }
    expect(isIdsError(err)).toBe(true);
    expect((err as IdsError).code).toBe("invalid_id");
    expect((err as IdsError).cause).toBe("not_string");
  });

  it("rejects undefined from DB", () => {
    let err: unknown;
    try {
      transformer.from(undefined);
    } catch (e) {
      err = e;
    }
    expect(isIdsError(err)).toBe(true);
    expect((err as IdsError).code).toBe("invalid_id");
    expect((err as IdsError).cause).toBe("not_string");
  });

  it("rejects a number from DB", () => {
    let err: unknown;
    try {
      transformer.from(42);
    } catch (e) {
      err = e;
    }
    expect(isIdsError(err)).toBe(true);
    expect((err as IdsError).code).toBe("invalid_id");
    expect((err as IdsError).cause).toBe("not_string");
  });

  it("read result is typed as Id<Brand>", () => {
    const id = usr.generate();
    const result = transformer.from(id) as unknown as Id<"usr">;
    expectTypeOf(result).toEqualTypeOf<Id<"usr">>();
  });
});
