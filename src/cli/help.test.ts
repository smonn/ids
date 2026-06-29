import { describe, expect, it } from "vitest";
import { codecModules, run } from "./router.js";
import { usage } from "./help.js";

describe("usage codec list matches codecModules", () => {
  it("usage() codec names equal codecModules.map(m => m.codec)", () => {
    const names = codecModules.map((m) => m.codec);
    const out = usage(names);
    expect(out).toContain(names.join(", "));
  });

  it("run --help output contains every codecModules codec name", async () => {
    const captured: string[] = [];
    const opts = {
      argv: ["--help"],
      stdout: (s: string) => captured.push(s),
      stderr: (_s: string) => {},
    };
    const code = await run(opts as Parameters<typeof run>[0]);
    expect(code).toBe(0);
    const output = captured.join("");
    for (const m of codecModules) {
      expect(output).toContain(m.codec);
    }
  });
});
