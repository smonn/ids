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

  it("keeps only the first error when several occur", () => {
    expect(parseArgs(["--nope", "--alsobad"], specs).error).toBe("unsupported flag: --nope");
  });

  it("does not consume a recognized following flag written in inline form", () => {
    const r = parseArgs(["--count", "--json=x"], specs);
    expect(r.values.get("--count")).toBe("");
  });
});

describe("parseArgs hostile-bytes redaction", () => {
  it("strips control chars from an unsupported flag token before echoing (args.ts:62)", () => {
    const r = parseArgs(["--\x1b]0;x\x07nope"], specs);
    expect(r.error).toBeDefined();
    expect(r.error).toContain("unsupported flag");
    expect(r.error).not.toContain("\x1b");
    expect(r.error).not.toContain("\x07");
  });

  it("does not echo the inline value for a boolean flag given an inline value (args.ts:94)", () => {
    const r = parseArgs(["--json=\x1b]0;x\x07"], specs);
    expect(r.error).toBeDefined();
    expect(r.error).toContain("flag does not take a value");
    expect(r.error).not.toContain("\x1b");
    expect(r.error).not.toContain("\x07");
  });
});
