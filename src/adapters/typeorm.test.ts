import { fromAny } from "@total-typescript/shoehorn";
import { describe, expect, expectTypeOf, it } from "vitest";
import { createTimestampId } from "../codecs/timestamp/index.js";
import { createReverseTimestampId } from "../codecs/reverse/index.js";
import {
  idTransformer,
  nullableIdTransformer,
  beforeInsertHook,
  type IdColumnCodec,
  type IdGeneratingCodec,
} from "./typeorm.js";
import type { Id } from "../types.js";
import { makeSpyCodec, expectInvalidIdError } from "./test-helpers.js";

describe("typeorm", () => {
  const usr = createTimestampId("usr", { allowDuplicateBrand: true });
  const org = createTimestampId("org", { allowDuplicateBrand: true });

  const transformer = idTransformer(usr);

  it("write path stores the canonical string", () => {
    const id = usr.generate();
    expectTypeOf(transformer.to).toBeFunction();
    expect(transformer.to(id)).toBe(id);
  });

  it("write path rejects a cast-smuggled invalid string", async () => {
    await expectInvalidIdError(() => transformer.to("not_an_id" as Id<"usr">));
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

  it("rejects a wrong-brand value from DB", async () => {
    const orgId = org.generate();
    await expectInvalidIdError(() => transformer.from(orgId), { cause: "invalid_prefix" });
  });

  it("rejects a malformed value from DB", async () => {
    // valid prefix, invalid base32 payload
    await expectInvalidIdError(() => transformer.from("usr_!!!!!!!!!!!!!!!!!!!!!!!!!!"), {
      cause: "invalid_base32",
    });
  });

  it("rejects null from DB", async () => {
    await expectInvalidIdError(() => transformer.from(null), { cause: "not_string" });
  });

  it("rejects undefined from DB", async () => {
    await expectInvalidIdError(() => transformer.from(undefined), { cause: "not_string" });
  });

  it("rejects a number from DB", async () => {
    await expectInvalidIdError(() => transformer.from(42), { cause: "not_string" });
  });

  it("read result is typed as Id<Brand>", () => {
    const id = usr.generate();
    const result: Id<"usr"> = fromAny(transformer.from(id));
    expectTypeOf(result).toEqualTypeOf<Id<"usr">>();
  });

  describe("safeParse-only contract (spy codec)", () => {
    it("from calls only safeParse on the codec", () => {
      const spyCodec = makeSpyCodec("spy");
      idTransformer(spyCodec).from("any_value");
      expect(spyCodec.safeParse).toHaveBeenCalled();
      expect(spyCodec.extractTimestamp).not.toHaveBeenCalled();
      expect(spyCodec.wrap).not.toHaveBeenCalled();
      expect(spyCodec.unwrap).not.toHaveBeenCalled();
    });
  });

  describe("beforeInsertHook", () => {
    it("sets the field when it is undefined", () => {
      const hook = beforeInsertHook("id", usr);
      const entity: Record<string, unknown> = { name: "Alice" };
      hook(entity);
      expect(typeof entity.id).toBe("string");
      expect(usr.is(entity.id as string)).toBe(true);
    });

    it("sets the field when it is null", () => {
      const hook = beforeInsertHook("id", usr);
      const entity: Record<string, unknown> = { id: null, name: "Alice" };
      hook(entity);
      expect(typeof entity.id).toBe("string");
      expect(usr.is(entity.id as string)).toBe(true);
    });

    it("does not overwrite a field that already has a value", () => {
      const existingId = usr.generate();
      const hook = beforeInsertHook("id", usr);
      const entity: Record<string, unknown> = { id: existingId, name: "Alice" };
      hook(entity);
      expect(entity.id).toBe(existingId);
    });

    it("return type of the hook function is void", () => {
      const hook = beforeInsertHook("id", usr);
      expectTypeOf(hook).returns.toEqualTypeOf<void>();
    });

    it("IdGeneratingCodec accepts the Timestamp codec", () => {
      expectTypeOf(usr).toMatchTypeOf<IdGeneratingCodec<"usr">>();
    });

    it("IdGeneratingCodec accepts the Reverse Timestamp codec", () => {
      const rev = createReverseTimestampId("rev", { allowDuplicateBrand: true });
      expectTypeOf(rev).toMatchTypeOf<IdGeneratingCodec<"rev">>();
    });

    it("a safeParse-only codec does not satisfy IdGeneratingCodec (type-level)", () => {
      const minimalCodec: IdColumnCodec<"spy"> = fromAny({
        safeParse: () => ({ ok: false as const, error: "not_string" as const }),
      });
      expectTypeOf(minimalCodec).not.toMatchTypeOf<IdGeneratingCodec<"spy">>();
    });
  });

  describe("nullableIdTransformer", () => {
    const nullableTransformer = nullableIdTransformer(usr);

    it("null from DB → null", () => {
      expect(nullableTransformer.from(null)).toBeNull();
    });

    it("undefined from DB → null", () => {
      expect(nullableTransformer.from(undefined)).toBeNull();
    });

    it("valid string from DB → Id<Brand>", () => {
      const id = usr.generate();
      expect(nullableTransformer.from(id)).toBe(id);
    });

    it("invalid string from DB → throws IdsError(invalid_id)", async () => {
      await expectInvalidIdError(() => nullableTransformer.from("usr_!!!!!!!!!!!!!!!!!!!!!!!!!!"));
    });

    it("write path passes null through unchanged", () => {
      expect(nullableTransformer.to(fromAny(null))).toBeNull();
    });

    it("write path normalises undefined to null", () => {
      expect(nullableTransformer.to(fromAny(undefined))).toBeNull();
    });

    it("write path passes Id<Brand> through as string", () => {
      const id = usr.generate();
      expect(nullableTransformer.to(id)).toBe(id);
    });

    it("write path rejects a cast-smuggled invalid string", async () => {
      await expectInvalidIdError(() => nullableTransformer.to("not_an_id" as Id<"usr">));
    });
  });
});
