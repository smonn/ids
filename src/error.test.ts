import { describe, expect, expectTypeOf, it } from "vitest";
import { IdsError, type IdsErrorCode, isIdsError } from "./error.js";

const ALL_CODES: IdsErrorCode[] = [
  "invalid_brand",
  "invalid_key_format",
  "invalid_key_encoding",
  "invalid_key_length",
  "invalid_kind",
  "empty_keyring",
  "duplicate_keyring_entry",
  "invalid_lookup_key",
  "verification_failed",
  "invalid_id",
];

describe("IdsError", () => {
  it("constructs with each code and surfaces message", () => {
    for (const code of ALL_CODES) {
      const err = new IdsError(code, "test message");
      expect(err.code).toBe(code);
      expect(err.message).toBe("test message");
    }
  });

  it("code is typed as IdsErrorCode", () => {
    const err = new IdsError("invalid_brand", "bad brand");
    expectTypeOf(err.code).toEqualTypeOf<IdsErrorCode>();
  });

  it("code is readonly at compile time", () => {
    const err = new IdsError("invalid_brand", "bad brand");
    // @ts-expect-error — code is readonly
    err.code = "invalid_id";
  });

  it("name is IdsError", () => {
    const err = new IdsError("invalid_kind", "bad kind");
    expect(err.name).toBe("IdsError");
  });

  it("instanceof Error holds", () => {
    const err = new IdsError("verification_failed", "tag mismatch");
    expect(err instanceof Error).toBe(true);
  });

  it("instanceof IdsError holds", () => {
    const err = new IdsError("empty_keyring", "no keys");
    expect(err instanceof IdsError).toBe(true);
  });

  it("cause round-trips", () => {
    const cause = new Error("underlying parse failure");
    const err = new IdsError("invalid_id", "not a valid ID", { cause });
    expect(err.cause).toBe(cause);
  });

  it("brand property is non-enumerable", () => {
    const err = new IdsError("invalid_brand", "test");
    const keys = Object.keys(err);
    const symbolKeys = Object.getOwnPropertySymbols(err);
    for (const sym of symbolKeys) {
      expect(Object.getOwnPropertyDescriptor(err, sym)?.enumerable).toBe(false);
    }
    expect(keys).not.toContain(expect.stringMatching(/brand|IdsError/i));
  });
});

describe("isIdsError", () => {
  it("returns true for a branded IdsError instance", () => {
    const err = new IdsError("invalid_brand", "test");
    expect(isIdsError(err)).toBe(true);
  });

  it("returns true for all codes", () => {
    for (const code of ALL_CODES) {
      expect(isIdsError(new IdsError(code, "msg"))).toBe(true);
    }
  });

  it("returns false for a plain Error", () => {
    expect(isIdsError(new Error("plain error"))).toBe(false);
  });

  it("returns false for a brand-less look-alike (foreign realm simulation)", () => {
    const lookalike = {
      code: "invalid_brand" as IdsErrorCode,
      message: "fake",
      name: "IdsError",
    };
    expect(isIdsError(lookalike)).toBe(false);
  });

  it("returns false for null", () => {
    expect(isIdsError(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isIdsError(undefined)).toBe(false);
  });

  it("returns false for a string", () => {
    expect(isIdsError("not an error")).toBe(false);
  });

  it("returns false for a number", () => {
    expect(isIdsError(42)).toBe(false);
  });

  it("returns false for a boolean", () => {
    expect(isIdsError(true)).toBe(false);
  });
});
