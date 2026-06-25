import { describe, expect, it } from "vitest";
import { splitFlags } from "./flags.js";

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
