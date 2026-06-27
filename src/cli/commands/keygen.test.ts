import { describe, expect, it } from "vitest";
import { runKeygen } from "./keygen.js";
import { makeOpts } from "../test-helpers.js";

function makeCapturingOpts(env: Record<string, string> = {}) {
  const out: string[] = [];
  const err: string[] = [];
  const opts = {
    ...makeOpts(env),
    stdout: (s: string) => {
      out.push(s);
    },
    stderr: (s: string) => {
      err.push(s);
    },
  };
  return { opts, out, err };
}

describe("runKeygen — selector-flag stray positionals (#726)", () => {
  it("keygen --wrapped <extra> exits 2 with 'unexpected argument'", async () => {
    const { opts, err } = makeCapturingOpts();
    const code = await runKeygen(["--wrapped", "extrapos"], opts);
    expect(code).toBe(2);
    expect(err.join("")).toContain("unexpected argument: extrapos");
  });

  it("keygen --signed <extra> exits 2 with 'unexpected argument'", async () => {
    const { opts, err } = makeCapturingOpts();
    const code = await runKeygen(["--signed", "extrapos"], opts);
    expect(code).toBe(2);
    expect(err.join("")).toContain("unexpected argument: extrapos");
  });

  it("keygen --digest <extra> exits 2 with 'unexpected argument'", async () => {
    const { opts, err } = makeCapturingOpts();
    const code = await runKeygen(["--digest", "extrapos"], opts);
    expect(code).toBe(2);
    expect(err.join("")).toContain("unexpected argument: extrapos");
  });
});

describe("runKeygen — inline value on selector flags (#726)", () => {
  it("keygen --wrapped=foo exits 2 with 'flag does not take a value: --wrapped'", async () => {
    const { opts, err } = makeCapturingOpts();
    const code = await runKeygen(["--wrapped=foo"], opts);
    expect(code).toBe(2);
    expect(err.join("")).toContain("flag does not take a value: --wrapped");
  });

  it("keygen --signed=foo exits 2 with 'flag does not take a value: --signed'", async () => {
    const { opts, err } = makeCapturingOpts();
    const code = await runKeygen(["--signed=foo"], opts);
    expect(code).toBe(2);
    expect(err.join("")).toContain("flag does not take a value: --signed");
  });

  it("keygen --digest=foo exits 2 with 'flag does not take a value: --digest'", async () => {
    const { opts, err } = makeCapturingOpts();
    const code = await runKeygen(["--digest=foo"], opts);
    expect(code).toBe(2);
    expect(err.join("")).toContain("flag does not take a value: --digest");
  });
});

describe("runKeygen — --ns whitespace rejection (#726)", () => {
  it("keygen --digest --ns '  pad  ' exits 2 with --ns whitespace error", async () => {
    const { opts, err } = makeCapturingOpts();
    const code = await runKeygen(["--digest", "--ns", "  pad  "], opts);
    expect(code).toBe(2);
    expect(err.join("")).toContain("--ns");
    expect(err.join("")).toContain("whitespace");
  });
});

describe("runKeygen — stdout/stderr separation (#726)", () => {
  it("successful keygen writes key to stdout and warning to stderr only", async () => {
    const { opts, out, err } = makeCapturingOpts();
    const code = await runKeygen([], opts);
    expect(code).toBe(0);
    expect(out).toHaveLength(1);
    expect(err).toHaveLength(1);
    expect(out[0]).toMatch(/\n$/);
    expect(err[0]).toContain("Warning");
    expect(out[0]).not.toContain("Warning");
  });

  it("successful keygen --signed writes key to stdout and warning to stderr only", async () => {
    const { opts, out, err } = makeCapturingOpts();
    const code = await runKeygen(["--signed"], opts);
    expect(code).toBe(0);
    expect(out).toHaveLength(1);
    expect(err).toHaveLength(1);
    expect(err[0]).toContain("Warning");
    expect(out[0]).not.toContain("Warning");
  });

  it("successful keygen --digest writes key to stdout and warning to stderr only", async () => {
    const { opts, out, err } = makeCapturingOpts();
    const code = await runKeygen(["--digest"], opts);
    expect(code).toBe(0);
    expect(out).toHaveLength(1);
    expect(err).toHaveLength(1);
    expect(err[0]).toContain("Warning");
    expect(out[0]).not.toContain("Warning");
  });
});
