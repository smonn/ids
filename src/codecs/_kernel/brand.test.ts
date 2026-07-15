import { describe, expect, it } from "vitest";
import { isIdsError } from "../../error.js";
import { validateBrand } from "./brand.js";

describe("validateBrand", () => {
  it.each([
    ["AAA", "uppercase"],
    ["a1c", "digit"],
    ["a_c", "symbol"],
    [" ab", "leading whitespace"],
    ["", "empty"],
    ["ab", "too short"],
    ["abcd", "too long"],
    ["ábc", "non-ASCII"],
  ])("throws invalid_brand for %j (%s)", (brand) => {
    let err: unknown;
    try {
      validateBrand(brand);
    } catch (e) {
      err = e;
    }
    expect(isIdsError(err)).toBe(true);
    if (isIdsError(err)) {
      expect(err.code).toBe("invalid_brand");
    }
  });

  it("does not throw for a valid three-lowercase-letter brand", () => {
    expect(() => validateBrand("abc")).not.toThrow();
  });
});
