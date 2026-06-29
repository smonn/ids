import { describe, expect, it } from "vitest";
import { maxGenerateCount } from "./constants.js";
import { isCliError } from "./errors.js";
import { parseCount, parseKind, parseNs } from "./flags.js";

describe("parseCount", () => {
  it("defaults to 1", () => {
    expect(parseCount(new Map())).toBe(1);
  });

  it("parses a positive integer", () => {
    expect(parseCount(new Map([["--count", "5"]]))).toBe(5);
  });

  it("rejects non-integers and over-cap values", () => {
    const abc = parseCount(new Map([["--count", "abc"]]));
    expect(isCliError(abc) ? abc.message : "").toContain("positive integer");
    const tooLarge = parseCount(new Map([["--count", String(maxGenerateCount + 1)]]));
    expect(isCliError(tooLarge) ? tooLarge.message : "").toContain("at most");
    const empty = parseCount(new Map([["--count", ""]]));
    expect(isCliError(empty) ? empty.message : "").toBe("--count requires a value");
  });
});

describe("parseKind", () => {
  it("accepts the four kinds", () => {
    expect(parseKind(new Map([["--kind", "u64"]]))).toBe("u64");
  });

  it("returns undefined when absent", () => {
    expect(parseKind(new Map())).toBeUndefined();
  });

  it("rejects an empty --kind value", () => {
    expect(isCliError(parseKind(new Map([["--kind", ""]])))).toBe(true);
  });

  it("flags an invalid kind", () => {
    expect(isCliError(parseKind(new Map([["--kind", "u8"]])))).toBe(true);
  });
});

describe("parseNs", () => {
  it("accepts a non-empty namespace", () => {
    expect(parseNs(new Map([["--ns", "billing"]]))).toBe("billing");
  });

  it("returns undefined when absent", () => {
    expect(parseNs(new Map())).toBeUndefined();
  });

  it("rejects empty and whitespace-padded namespaces", () => {
    expect(isCliError(parseNs(new Map([["--ns", ""]])))).toBe(true);
    expect(isCliError(parseNs(new Map([["--ns", "  "]])))).toBe(true);
    expect(isCliError(parseNs(new Map([["--ns", " x "]])))).toBe(true);
  });
});
