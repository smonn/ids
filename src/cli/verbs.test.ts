import { describe, expect, it } from "vitest";
import { IdsError } from "../error.js";
import type { InspectSpec } from "./verbs.js";
import { brandOfId, mapThrown, redactToken } from "./verbs.js";

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

describe("redactToken", () => {
  it("returns tokens of 20 chars unchanged", () => {
    expect(redactToken("a".repeat(20))).toBe("a".repeat(20));
  });

  it("truncates tokens longer than 20 chars with ellipsis", () => {
    expect(redactToken("a".repeat(21))).toBe("a".repeat(20) + "…");
  });

  it("returns short tokens unchanged", () => {
    expect(redactToken("short")).toBe("short");
  });

  it("strips C0/C1/ESC control characters before truncation", () => {
    expect(redactToken("\x1b]0;pwned\x07")).toBe("]0;pwned");
  });

  it("strips control chars then truncates if remainder exceeds 20 chars", () => {
    expect(redactToken("\x1b" + "a".repeat(21))).toBe("a".repeat(20) + "…");
  });

  it("strips DEL (U+007F) and C1 range (U+0080–U+009F)", () => {
    expect(redactToken("\x7fhello\x80world\x9f")).toBe("helloworld");
  });
});

// Type-level check: constructing a keyed:true InspectSpec without codecKey is a type error.
// @ts-expect-error -- codecKey is required when keyed: true
const _badSpec: InspectSpec<string> = {
  keyed: true,
  prepare: () => () =>
    Promise.resolve({ shape: "timestamp" as const, brand: "x", codec: "x", ms: 0, uuid: "" }),
};
