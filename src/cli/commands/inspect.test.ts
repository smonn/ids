import { describe, expect, it } from "vitest";
import { runInspect } from "./inspect.js";
import { makeOpts } from "../test-helpers.js";

const testUuid = "00000000-0000-0000-0000-000000000000";

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

describe("runInspect — --from-uuid flag conflicts (#726)", () => {
  it("--from-uuid with --opaque exits 2 with a usage error naming both flags", async () => {
    const { opts, err } = makeCapturingOpts();
    const code = await runInspect(["--from-uuid", testUuid, "--brand", "usr", "--opaque"], opts);
    expect(code).toBe(2);
    expect(err.join("")).toContain("--opaque");
    expect(err.join("")).toContain("--from-uuid");
  });

  it("--from-uuid with --signed exits 2 with a usage error", async () => {
    const { opts, err } = makeCapturingOpts();
    const code = await runInspect(["--from-uuid", testUuid, "--brand", "usr", "--signed"], opts);
    expect(code).toBe(2);
    expect(err.join("")).toContain("--signed");
    expect(err.join("")).toContain("--from-uuid");
  });

  it("--from-uuid with --reverse exits 2 with a usage error", async () => {
    const { opts, err } = makeCapturingOpts();
    const code = await runInspect(["--from-uuid", testUuid, "--brand", "usr", "--reverse"], opts);
    expect(code).toBe(2);
    expect(err.join("")).toContain("--reverse");
    expect(err.join("")).toContain("--from-uuid");
  });

  it("--from-uuid with --wrapped exits 2 with a usage error", async () => {
    const { opts, err } = makeCapturingOpts();
    const code = await runInspect(["--from-uuid", testUuid, "--brand", "usr", "--wrapped"], opts);
    expect(code).toBe(2);
    expect(err.join("")).toContain("--wrapped");
    expect(err.join("")).toContain("--from-uuid");
  });

  it("--from-uuid with --key-format exits 2 with a usage error naming both flags", async () => {
    const { opts, err } = makeCapturingOpts();
    const code = await runInspect(
      ["--from-uuid", testUuid, "--brand", "usr", "--key-format", "hex"],
      opts,
    );
    expect(code).toBe(2);
    expect(err.join("")).toContain("--key-format");
    expect(err.join("")).toContain("--from-uuid");
  });
});
