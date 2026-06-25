import { describe, expect, expectTypeOf, it } from "vitest";
import type { Id, ValidBrand } from "./types.js";
import { createTimestampId } from "./codecs/timestamp/index.js";

describe("Id<Brand> unique-symbol branding", () => {
  it("a structurally equivalent __brand object is not assignable to Id<Brand>", () => {
    // This mirrors the old __brand-based structure. With the unique-symbol brand
    // it can no longer be assigned to Id<"usr"> without going through the library.
    type FakeUsrId = `usr_${string}` & { readonly __brand: "usr" };
    // @ts-expect-error — FakeUsrId must not satisfy Id<"usr"> after unique-symbol branding
    const _: Id<"usr"> = "usr_0000000000000000000000000000" as FakeUsrId;
    void _;
  });
});

describe("ValidBrand type-level enforcement", () => {
  it("createTimestampId('usr') infers Brand = 'usr' with no extra annotation", () => {
    const usr = createTimestampId("usr");
    expectTypeOf(usr.generate()).toEqualTypeOf<Id<"usr">>();
  });

  it("createTimestampId with a 2-char brand is a compile-time error", () => {
    // @ts-expect-error — "ab" is not a ValidBrand (only 2 chars); also validates at runtime
    expect(() => createTimestampId("ab")).toThrow();
  });

  it("createTimestampId with a 4-char brand is a compile-time error", () => {
    // @ts-expect-error — "user" is not a ValidBrand (4 chars); also validates at runtime
    expect(() => createTimestampId("user")).toThrow();
  });

  it("createTimestampId with non-alpha chars is a compile-time error", () => {
    // @ts-expect-error — "123" is not a ValidBrand (digits, not lowercase a-z); also validates at runtime
    expect(() => createTimestampId("123")).toThrow();
  });

  it("ValidBrand is exported and is a subtype of string", () => {
    type Check = ValidBrand extends string ? true : false;
    const _: Check = true;
    void _;
  });
});
