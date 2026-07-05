import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Path to the single-source hygiene checker. This test enforces the
// no-raw-invisible-code-points rule in CI via pnpm test:coverage.
const scriptPath = fileURLToPath(
  new URL("../.github/scripts/source-hygiene-lint.mjs", import.meta.url),
);

describe("source hygiene", () => {
  it("no raw invisible code points in any git-tracked text file", () => {
    let output = "";
    try {
      output = execFileSync("node", [scriptPath], { encoding: "utf8", stdio: "pipe" });
    } catch (err) {
      const e = err as NodeJS.ErrnoException & { stderr?: string; stdout?: string };
      throw new Error(
        ("source-hygiene-lint found violations:\n" + (e.stderr ?? "") + (e.stdout ?? "")).trim(),
      );
    }
    expect(output).toContain("clean");
  });
});
