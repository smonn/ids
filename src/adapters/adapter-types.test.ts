import { describe, expect, it } from "vitest";
import { resolveIdParamFailure } from "./adapter-types.js";

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
