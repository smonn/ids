import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

// Path to the single-source hygiene checker. This test enforces the
// no-raw-invisible-code-points rule in CI via pnpm test:coverage.
const scriptUrl = new URL("../.github/scripts/source-hygiene-lint.mjs", import.meta.url);
const scriptPath = fileURLToPath(scriptUrl);

type FileRecord = { name: string; content: string };

let checkCliIdiomLeaks: (files: FileRecord[]) => string[];

beforeAll(async () => {
  const mod = await import(scriptUrl.href);
  checkCliIdiomLeaks = mod.checkCliIdiomLeaks;
});

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

describe("checkCliIdiomLeaks", () => {
  it("returns no violations when src/cli/ files are clean", () => {
    const files: FileRecord[] = [
      { name: "src/cli/verbs.ts", content: "// no pattern here" },
      { name: "src/cli/commands/convert.ts", content: "rejectExtraPositionals(opts, p, 1)" },
    ];
    expect(checkCliIdiomLeaks(files)).toHaveLength(0);
  });

  it("exempts src/cli/args.ts (the canonical home)", () => {
    const files: FileRecord[] = [
      {
        name: "src/cli/args.ts",
        content: "usageError(`unexpected argument: ${redactToken(positionals[maxAllowed]!)}`)",
      },
    ];
    expect(checkCliIdiomLeaks(files)).toHaveLength(0);
  });

  it("exempts test files in src/cli/ that assert on the error string", () => {
    const files: FileRecord[] = [
      { name: "src/cli/router.test.ts", content: 'toContain("unexpected argument:")' },
    ];
    expect(checkCliIdiomLeaks(files)).toHaveLength(0);
  });

  it("ignores files outside src/cli/", () => {
    const files: FileRecord[] = [
      { name: "src/wire/foo.ts", content: "unexpected argument" },
      { name: "test/bar.test.ts", content: "unexpected argument" },
    ];
    expect(checkCliIdiomLeaks(files)).toHaveLength(0);
  });

  it("flags an inlined unexpected-argument pattern in a production CLI file", () => {
    const files: FileRecord[] = [
      {
        name: "src/cli/commands/new-verb.ts",
        content:
          "if (positionals.length > 1)\n  return fail(opts, usageError(`unexpected argument: ${token}`))",
      },
    ];
    const violations = checkCliIdiomLeaks(files);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain("src/cli/commands/new-verb.ts:2");
    expect(violations[0]).toContain("rejectExtraPositionals");
  });

  it("reports the correct line number for the violation", () => {
    const files: FileRecord[] = [
      {
        name: "src/cli/commands/other.ts",
        content: "// line 1\n// line 2\nunexpected argument found here\n// line 4",
      },
    ];
    const violations = checkCliIdiomLeaks(files);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain(":3:");
  });
});
