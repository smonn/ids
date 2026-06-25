import { describe, expect, expectTypeOf, it } from "vitest";
import { isIdsError } from "../error.js";
import type { ParseError } from "../types.js";
import { readIdColumn, resolveIdParamFailure } from "./adapter-types.js";
import { makeSpyCodec } from "./test-helpers.js";

describe("readIdColumn", () => {
  it("caught IdsError.cause is typed as ParseError | undefined", () => {
    expect.assertions(1);
    const codec = { safeParse: () => ({ ok: false as const, error: "invalid_prefix" as const }) };
    try {
      readIdColumn(codec, "bad_value");
    } catch (err) {
      if (isIdsError(err)) {
        expectTypeOf(err.cause).toEqualTypeOf<ParseError | undefined>();
        expect(err.cause).toBe("invalid_prefix");
      }
    }
  });

  it("calls safeParse and not extractTimestamp / wrap / unwrap (spy codec contract)", () => {
    const spyCodec = makeSpyCodec("spy");
    readIdColumn(spyCodec, "any_value");
    expect(spyCodec.safeParse).toHaveBeenCalled();
    expect(spyCodec.extractTimestamp).not.toHaveBeenCalled();
    expect(spyCodec.wrap).not.toHaveBeenCalled();
    expect(spyCodec.unwrap).not.toHaveBeenCalled();
  });
});

describe("resolveIdParamFailure", () => {
  it("maps invalid_prefix to brand_mismatch with default status 404", () => {
    const result = resolveIdParamFailure("invalid_prefix");
    expect(result).toEqual({ reason: "brand_mismatch", status: 404 });
  });

  it("maps invalid_base32 to malformed with default status 400", () => {
    const result = resolveIdParamFailure("invalid_base32");
    expect(result).toEqual({ reason: "malformed", status: 400 });
  });

  it("maps not_string to malformed with default status 400", () => {
    const result = resolveIdParamFailure("not_string");
    expect(result).toEqual({ reason: "malformed", status: 400 });
  });

  it("options.status.brand_mismatch overrides the 404 default", () => {
    const result = resolveIdParamFailure("invalid_prefix", { status: { brand_mismatch: 422 } });
    expect(result).toEqual({ reason: "brand_mismatch", status: 422 });
  });

  it("options.status.malformed overrides the 400 default", () => {
    const result = resolveIdParamFailure("invalid_base32", { status: { malformed: 422 } });
    expect(result).toEqual({ reason: "malformed", status: 422 });
  });

  it("options.status.brand_mismatch does not affect malformed status", () => {
    const result = resolveIdParamFailure("invalid_base32", { status: { brand_mismatch: 422 } });
    expect(result).toEqual({ reason: "malformed", status: 400 });
  });

  it("options.status.malformed does not affect brand_mismatch status", () => {
    const result = resolveIdParamFailure("invalid_prefix", { status: { malformed: 422 } });
    expect(result).toEqual({ reason: "brand_mismatch", status: 404 });
  });
});
