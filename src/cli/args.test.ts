import { describe, expect, it } from "vitest";
import { type FlagSpec, parseArgs, rejectExtraPositionals } from "./args.js";
import type { RunOpts } from "./types.js";

function makeOpts(): RunOpts & { errLines: string[] } {
  const errLines: string[] = [];
  return {
    argv: [],
    stdout: () => {},
    stderr: (s: string) => errLines.push(s),
    errLines,
  };
}

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

describe("rejectExtraPositionals", () => {
  it("returns undefined when positionals count is within maxAllowed", () => {
    const opts = makeOpts();
    expect(rejectExtraPositionals(opts, [], 0)).toBeUndefined();
    expect(rejectExtraPositionals(opts, ["usr"], 1)).toBeUndefined();
    expect(rejectExtraPositionals(opts, ["usr"], 0 + 1)).toBeUndefined();
    expect(opts.errLines).toHaveLength(0);
  });

  it("returns 2 (usage exit code) when positionals exceed maxAllowed=1", () => {
    const opts = makeOpts();
    const result = rejectExtraPositionals(opts, ["usr", "extra"], 1);
    expect(result).toBe(2);
  });

  it("returns 2 (usage exit code) when positionals exceed maxAllowed=0", () => {
    const opts = makeOpts();
    const result = rejectExtraPositionals(opts, ["extra"], 0);
    expect(result).toBe(2);
  });

  it("writes the error message to stderr", () => {
    const opts = makeOpts();
    rejectExtraPositionals(opts, ["usr", "extra"], 1);
    expect(opts.errLines).toHaveLength(1);
    expect(opts.errLines[0]).toContain("unexpected argument:");
    expect(opts.errLines[0]).toContain("extra");
  });

  it("names the first extra positional in the error (index = maxAllowed)", () => {
    const opts = makeOpts();
    rejectExtraPositionals(opts, ["usr", "first-extra", "second-extra"], 1);
    expect(opts.errLines[0]).toContain("first-extra");
    expect(opts.errLines[0]).not.toContain("second-extra");
  });

  it("redacts long tokens in the error message", () => {
    const opts = makeOpts();
    const long = "x".repeat(25);
    rejectExtraPositionals(opts, [long], 0);
    expect(opts.errLines[0]).not.toContain(long);
    expect(opts.errLines[0]).toContain("x".repeat(20) + "…");
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
