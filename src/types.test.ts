import { describe, expectTypeOf, it } from "vitest";
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

describe("ValidBrand compile-time enforcement", () => {
  it("resolves to S for valid 3-char lowercase brands", () => {
    expectTypeOf<ValidBrand<"usr">>().toEqualTypeOf<"usr">();
    expectTypeOf<ValidBrand<"org">>().toEqualTypeOf<"org">();
    expectTypeOf<ValidBrand<"abc">>().toEqualTypeOf<"abc">();
    expectTypeOf<ValidBrand<"zzz">>().toEqualTypeOf<"zzz">();
  });

  it("resolves to never for brands with wrong character count", () => {
    expectTypeOf<ValidBrand<"ab">>().toEqualTypeOf<never>();
    expectTypeOf<ValidBrand<"user">>().toEqualTypeOf<never>();
    expectTypeOf<ValidBrand<"">>().toEqualTypeOf<never>();
  });

  it("resolves to never for brands with non-lowercase-alpha characters", () => {
    expectTypeOf<ValidBrand<"123">>().toEqualTypeOf<never>();
    expectTypeOf<ValidBrand<"Usr">>().toEqualTypeOf<never>();
    expectTypeOf<ValidBrand<"uSr">>().toEqualTypeOf<never>();
    expectTypeOf<ValidBrand<"usR">>().toEqualTypeOf<never>();
    expectTypeOf<ValidBrand<"u1r">>().toEqualTypeOf<never>();
  });

  it("resolves to string for the generic string type (preserves dynamic-brand call sites)", () => {
    expectTypeOf<ValidBrand<string>>().toEqualTypeOf<string>();
  });

  it("createTimestampId rejects invalid brands at the call site", () => {
    // Type-level checks only — the wrapping function is never called at runtime.
    const _typeCheckOnly = () => {
      // @ts-expect-error — "ab" (2 chars): ValidBrand<"ab"> = never
      createTimestampId("ab", { allowDuplicateBrand: true });
      // @ts-expect-error — "user" (4 chars): ValidBrand<"user"> = never
      createTimestampId("user", { allowDuplicateBrand: true });
      // @ts-expect-error — "123" (non-alpha): ValidBrand<"123"> = never
      createTimestampId("123", { allowDuplicateBrand: true });
      // @ts-expect-error — "Usr" (uppercase U): ValidBrand<"Usr"> = never
      createTimestampId("Usr", { allowDuplicateBrand: true });
    };
    void _typeCheckOnly;
  });

  it("createTimestampId accepts valid 3-char lowercase brands and infers Brand correctly", () => {
    const usr = createTimestampId("usr", { allowDuplicateBrand: true });
    const org = createTimestampId("org", { allowDuplicateBrand: true });
    expectTypeOf(usr.generate()).toEqualTypeOf<Id<"usr">>();
    expectTypeOf(org.generate()).toEqualTypeOf<Id<"org">>();
  });
});
