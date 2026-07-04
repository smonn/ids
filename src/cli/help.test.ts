import { describe, expect, it } from "vitest";
import { codecModules, run } from "./router.js";
import { helpForCodec, usage } from "./help.js";
import { makeOpts } from "./test-helpers.js";

describe("usage codec list matches codecModules", () => {
  it("usage() codec names equal codecModules.map(m => m.codec)", () => {
    const names = codecModules.map((m) => m.codec);
    const out = usage(names);
    expect(out).toContain(names.join(", "));
  });

  it("run --help output contains every codecModules codec name", async () => {
    const captured: string[] = [];
    const code = await run({
      ...makeOpts(),
      argv: ["--help"],
      stdout: (s) => captured.push(s),
      stderr: () => {},
    });
    expect(code).toBe(0);
    const output = captured.join("");
    for (const m of codecModules) {
      expect(output).toContain(m.codec);
    }
  });
});

describe("help key flags coverage", () => {
  it("usage() lists --key-file and IDS_KEY", () => {
    const out = usage(["timestamp"]);
    expect(out).toContain("--key-file");
    expect(out).toContain("IDS_KEY");
  });

  it("usage() mentions --key and warns to prefer safer channels", () => {
    const out = usage(["timestamp"]);
    expect(out).toContain("--key");
    expect(out).toContain("prefer");
  });

  it("helpForCodec() lists --key-file and IDS_KEY", () => {
    const out = helpForCodec("signed", ["generate", "inspect"]);
    expect(out).toContain("--key-file");
    expect(out).toContain("IDS_KEY");
  });

  it("helpForCodec() mentions --key and safer channels", () => {
    const out = helpForCodec("signed", ["generate", "inspect"]);
    expect(out).toContain("--key");
    expect(out).toContain("prefer");
  });
});
