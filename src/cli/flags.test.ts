import { describe, expect, it } from "vitest";
import { maxGenerateCount } from "./constants.js";
import { isKindError, isNsError, parseCount, parseKind, parseNs } from "./flags.js";

describe("parseCount", () => {
  it("defaults to 1", () => {
    expect(parseCount(new Map())).toBe(1);
  });

  it("parses a positive integer", () => {
    expect(parseCount(new Map([["--count", "5"]]))).toBe(5);
  });

  it("rejects non-integers and over-cap values", () => {
    expect(parseCount(new Map([["--count", "abc"]]))).toContain("positive integer");
    expect(parseCount(new Map([["--count", String(maxGenerateCount + 1)]]))).toContain("at most");
    expect(parseCount(new Map([["--count", ""]]))).toBe("--count requires a value");
  });
});

describe("parseKind / isKindError", () => {
  it("accepts the four kinds", () => {
    expect(parseKind(new Map([["--kind", "u64"]]))).toBe("u64");
  });

  it("returns undefined when absent", () => {
    expect(parseKind(new Map())).toBeUndefined();
  });

  it("flags an invalid kind", () => {
    const result = parseKind(new Map([["--kind", "u8"]]));
    expect(typeof result === "string" && isKindError(result)).toBe(true);
  });
});

describe("parseNs / isNsError", () => {
  it("accepts a non-empty namespace", () => {
    expect(parseNs(new Map([["--ns", "billing"]]))).toBe("billing");
  });

  it("rejects empty and whitespace-padded namespaces", () => {
    expect(isNsError(parseNs(new Map([["--ns", "  "]])) ?? "")).toBe(true);
    expect(isNsError(parseNs(new Map([["--ns", " x "]])) ?? "")).toBe(true);
  });
});
