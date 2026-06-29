import { describe, expect, it } from "vitest";
import { IdsError } from "../error.js";
import { brandOfId, mapThrown } from "./verbs.js";

describe("mapThrown", () => {
  const usageCodes = [
    "invalid_brand",
    "invalid_key_format",
    "invalid_key_encoding",
    "invalid_key_length",
    "invalid_kind",
    "invalid_lookup_key",
    "invalid_namespace",
    "invalid_timestamp",
  ] as const;

  const runtimeCodes = [
    "empty_keyring",
    "duplicate_keyring_entry",
    "verification_failed",
    "invalid_id",
  ] as const;

  for (const code of usageCodes) {
    it(`maps IdsError(${code}) to usage`, () => {
      expect(mapThrown(new IdsError(code, "msg")).kind).toBe("usage");
    });
  }

  for (const code of runtimeCodes) {
    it(`maps IdsError(${code}) to runtime`, () => {
      expect(mapThrown(new IdsError(code, "msg")).kind).toBe("runtime");
    });
  }

  it("maps an unknown error to runtime", () => {
    expect(mapThrown(new Error("boom")).kind).toBe("runtime");
  });
});

describe("brandOfId", () => {
  it("extracts a lowercased brand from a well-formed id", () => {
    expect(brandOfId("USR_06f8")).toBe("usr");
  });

  it("returns undefined for a non-id token", () => {
    expect(brandOfId("not-an-id")).toBeUndefined();
  });
});
