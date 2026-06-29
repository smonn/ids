import { describe, expect, it } from "vitest";
import { type FlagSpec, parseArgs } from "./args.js";

const specs: ReadonlyArray<FlagSpec> = [
  { name: "--count", alias: "-c", value: true },
  { name: "--value", value: true },
  { name: "--json", value: false },
];

describe("parseArgs", () => {
  it("collects positionals", () => {
    const r = parseArgs(["usr", "extra"], specs);
    expect(r.positionals).toEqual(["usr", "extra"]);
    expect(r.error).toBeUndefined();
  });

  it("reads a value flag via next token and via inline =", () => {
    expect(parseArgs(["--count", "5"], specs).values.get("--count")).toBe("5");
    expect(parseArgs(["--count=5"], specs).values.get("--count")).toBe("5");
  });

  it("resolves aliases to the canonical name", () => {
    const r = parseArgs(["-c", "3"], specs);
    expect(r.flags.has("--count")).toBe(true);
    expect(r.values.get("--count")).toBe("3");
  });

  it("reads a negative value as a value, not a flag", () => {
    expect(parseArgs(["--value", "-5"], specs).values.get("--value")).toBe("-5");
  });

  it("records boolean flag presence", () => {
    const r = parseArgs(["--json"], specs);
    expect(r.flags.has("--json")).toBe(true);
    expect(r.error).toBeUndefined();
  });

  it("reports the first usage error: unsupported, duplicate, value-on-boolean", () => {
    expect(parseArgs(["--nope"], specs).error).toBe("unsupported flag: --nope");
    expect(parseArgs(["--json", "--json"], specs).error).toBe("duplicate flag: --json");
    expect(parseArgs(["--json=1"], specs).error).toBe("flag does not take a value: --json");
  });

  it("treats a missing trailing value as empty string", () => {
    expect(parseArgs(["--count"], specs).values.get("--count")).toBe("");
  });

  it("does not swallow a recognized following flag as a value", () => {
    const r = parseArgs(["--count", "--json"], specs);
    expect(r.values.get("--count")).toBe("");
    expect(r.flags.has("--json")).toBe(true);
  });

  it("treats a lone dash as a positional", () => {
    expect(parseArgs(["-"], specs).positionals).toEqual(["-"]);
  });
});
