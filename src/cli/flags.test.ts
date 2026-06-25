import { describe, expect, it } from "vitest";
import {
  splitFlags,
  parseCount,
  parseBits,
  parseKind,
  parseNs,
  unsupportedFlagForCommand,
} from "./flags.js";
import { maxGenerateCount } from "./constants.js";

describe("splitFlags — splitFlagToken leading-'=' boundary", () => {
  it("leading-'=' token ('=foo') is not split: flag is the full token, inlineValue is undefined", () => {
    // splitFlagToken("=foo") must return { flag: "=foo", inlineValue: undefined }.
    // A mutant replacing '<= 0' with '< 0' would return { flag: "", inlineValue: "foo" },
    // which would match the "" entry in valueFlags and store "foo" in values instead
    // of pushing "=foo" to positionals.
    const result = splitFlags(["=foo"], new Set([""]));
    expect(result.positionals).toEqual(["=foo"]);
    expect(result.values.size).toBe(0);
  });

  it("no-'=' token ('--foo') yields flag === '--foo', inlineValue === undefined", () => {
    const result = splitFlags(["--foo"], new Set());
    expect(result.flags.has("--foo")).toBe(true);
    expect(result.positionals).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });
});

describe("parseCount", () => {
  it("missing --count returns 1", () => {
    expect(parseCount(new Map())).toBe(1);
  });

  it("empty --count value returns an error string containing '--count'", () => {
    const result = parseCount(new Map([["--count", ""]]));
    expect(typeof result).toBe("string");
    expect(result as string).toContain("--count");
  });

  it("non-integer string returns an error string", () => {
    const result = parseCount(new Map([["--count", "abc"]]));
    expect(typeof result).toBe("string");
    expect(result as string).toContain("--count");
  });

  it("valid small integer is returned as a number", () => {
    expect(parseCount(new Map([["--count", "5"]]))).toBe(5);
  });

  it("value equal to maxGenerateCount passes", () => {
    expect(parseCount(new Map([["--count", String(maxGenerateCount)]]))).toBe(maxGenerateCount);
  });

  it("value one above maxGenerateCount returns an error string", () => {
    const result = parseCount(new Map([["--count", String(maxGenerateCount + 1)]]));
    expect(typeof result).toBe("string");
    expect(result as string).toContain("--count");
  });

  it("value beyond Number.isSafeInteger (2^53) returns an error string", () => {
    // 9007199254740992 === 2^53 is not a safe integer
    const result = parseCount(new Map([["--count", "9007199254740992"]]));
    expect(typeof result).toBe("string");
    expect(result as string).toContain("--count");
  });
});

describe("canonicalFlag (via splitFlags duplicate detection)", () => {
  it("-c canonicalises to --count: -c 2 -c 3 produces 'duplicate flag: --count'", () => {
    const valueFlags = new Set(["--count", "-c"]);
    const result = splitFlags(["-c", "2", "-c", "3"], valueFlags);
    expect(result.errors).toEqual(["duplicate flag: --count"]);
  });

  it("-c canonicalises to --count: -c 3 -c 2 (reversed) produces 'duplicate flag: --count'", () => {
    const valueFlags = new Set(["--count", "-c"]);
    const result = splitFlags(["-c", "3", "-c", "2"], valueFlags);
    expect(result.errors).toEqual(["duplicate flag: --count"]);
  });

  it("non-alias flag is unchanged: duplicate --foo produces 'duplicate flag: --foo'", () => {
    const result = splitFlags(["--foo", "--foo"], new Set());
    expect(result.errors).toEqual(["duplicate flag: --foo"]);
  });
});

describe("parseBits", () => {
  it("missing --bits returns 256", () => {
    expect(parseBits(new Map())).toBe(256);
  });

  it("128 is a valid value", () => {
    expect(parseBits(new Map([["--bits", "128"]]))).toBe(128);
  });

  it("192 is a valid value", () => {
    expect(parseBits(new Map([["--bits", "192"]]))).toBe(192);
  });

  it("256 is a valid value", () => {
    expect(parseBits(new Map([["--bits", "256"]]))).toBe(256);
  });

  it("invalid value returns an error string containing '--bits'", () => {
    const result = parseBits(new Map([["--bits", "384"]]));
    expect(typeof result).toBe("string");
    expect(result as string).toContain("--bits");
  });
});

describe("parseKind", () => {
  it("missing --kind returns undefined", () => {
    expect(parseKind(new Map())).toBeUndefined();
  });

  it("'u32' is a valid value", () => {
    expect(parseKind(new Map([["--kind", "u32"]]))).toBe("u32");
  });

  it("'i32' is a valid value", () => {
    expect(parseKind(new Map([["--kind", "i32"]]))).toBe("i32");
  });

  it("'u64' is a valid value", () => {
    expect(parseKind(new Map([["--kind", "u64"]]))).toBe("u64");
  });

  it("'i64' is a valid value", () => {
    expect(parseKind(new Map([["--kind", "i64"]]))).toBe("i64");
  });

  it("empty value returns an error string containing '--kind'", () => {
    const result = parseKind(new Map([["--kind", ""]]));
    expect(typeof result).toBe("string");
    expect(result as string).toContain("--kind");
  });

  it("invalid value returns an error string", () => {
    const result = parseKind(new Map([["--kind", "u8"]]));
    expect(typeof result).toBe("string");
    expect(result as string).toContain("--kind");
  });
});

describe("parseNs", () => {
  it("missing --ns returns undefined", () => {
    expect(parseNs(new Map())).toBeUndefined();
  });

  it("non-empty value is returned as-is", () => {
    expect(parseNs(new Map([["--ns", "checkout"]]))).toBe("checkout");
  });

  it("empty value returns an error string containing '--ns'", () => {
    const result = parseNs(new Map([["--ns", ""]]));
    expect(typeof result).toBe("string");
    expect(result as string).toContain("--ns");
  });
});

describe("unsupportedFlagForCommand", () => {
  it("returns undefined for an allowed flag", () => {
    const result = unsupportedFlagForCommand(
      "generate",
      new Set(["--count"]),
      new Set(["--count"]),
    );
    expect(result).toBeUndefined();
  });

  it("returns 'unsupported flag for <command>: <flag>' for a known-but-unsupported flag", () => {
    // --bits is in knownFlags but not in the allowed set for generate
    const result = unsupportedFlagForCommand("generate", new Set(["--bits"]), new Set(["--count"]));
    expect(result).toBe("unsupported flag for generate: --bits");
  });

  it("returns 'unsupported flag: <flag>' for an unknown flag", () => {
    const result = unsupportedFlagForCommand(
      "generate",
      new Set(["--bogus"]),
      new Set(["--count"]),
    );
    expect(result).toBe("unsupported flag: --bogus");
  });
});
