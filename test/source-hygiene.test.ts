import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

// Path to the single-source hygiene checker. This test enforces the
// no-raw-invisible-code-points rule in CI via pnpm test:coverage.
const scriptUrl = new URL("../.github/scripts/source-hygiene-lint.mjs", import.meta.url);
const scriptPath = fileURLToPath(scriptUrl);

type FileRecord = { name: string; content: string };

let checkCliIdiomLeaks: (files: FileRecord[]) => string[];
let checkContent: (content: string, filePath: string) => string[];
let lintFiles: (files: FileRecord[]) => string[];

beforeAll(async () => {
  const mod = await import(scriptUrl.href);
  checkCliIdiomLeaks = mod.checkCliIdiomLeaks;
  checkContent = mod.checkContent;
  lintFiles = mod.lintFiles;
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

describe("checkContent", () => {
  it("returns empty array for clean content", () => {
    expect(checkContent("hello world\nno violations here", "clean.ts")).toHaveLength(0);
  });

  it("allows tab (U+0009) and newline (LF) in content", () => {
    expect(checkContent("line1\n\tindented line\nline3", "tab-lf.ts")).toHaveLength(0);
  });

  it("flags NUL (U+0000) -- probe for U+0000-U+0008 range", () => {
    const violations = checkContent("before \u0000 after", "nul.ts");
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain("U+0000");
  });

  it("flags VT (U+000B) -- probe for U+000B-U+000C range", () => {
    const violations = checkContent("line \u000b text", "vt.ts");
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain("U+000B");
  });

  it("flags unit separator (U+001F) -- probe for U+000E-U+001F range", () => {
    const violations = checkContent("line \u001f text", "us.ts");
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain("U+001F");
  });

  it("flags U+0080 -- probe for C1 range", () => {
    const violations = checkContent("line \u0080 text", "c1.ts");
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain("U+0080");
  });

  it("flags zero-width space (U+200B) -- probe for U+200B-U+200F range", () => {
    const violations = checkContent("line \u200b text", "zwsp.ts");
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain("U+200B");
  });

  it("flags line separator (U+2028)", () => {
    const violations = checkContent("line \u2028 text", "ls.ts");
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain("U+2028");
  });

  it("flags paragraph separator (U+2029)", () => {
    const violations = checkContent("line \u2029 text", "ps.ts");
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain("U+2029");
  });

  it("flags RIGHT-TO-LEFT OVERRIDE (U+202E) -- probe for U+202A-U+202E range", () => {
    const violations = checkContent("line \u202e text", "rlo.ts");
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain("U+202E");
  });

  it("flags WORD JOINER (U+2060) -- probe for U+2060-U+2069 range", () => {
    const violations = checkContent("line \u2060 text", "wj.ts");
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain("U+2060");
  });

  it("flags BOM (U+FEFF) -- singleton probe", () => {
    const violations = checkContent("\ufeff file content", "bom.ts");
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain("U+FEFF");
  });

  it("violation includes the file path, 1-based line number, and U+XXXX label", () => {
    const violations = checkContent("good line\nbad \u200b line", "src/foo.ts");
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain("src/foo.ts");
    expect(violations[0]).toContain(":2:");
    expect(violations[0]).toContain("U+200B");
  });

  it("reports two entries when a single line contains two forbidden chars", () => {
    const violations = checkContent("\u0000 bad \u202e", "two.ts");
    expect(violations).toHaveLength(2);
    expect(violations[0]).toContain("U+0000");
    expect(violations[1]).toContain("U+202E");
  });

  it("reports violations on different lines with the correct line number for each", () => {
    const violations = checkContent("clean\n\u000b line2\nclean\n\u200b line4", "multi.ts");
    expect(violations).toHaveLength(2);
    expect(violations[0]).toContain(":2:");
    expect(violations[0]).toContain("U+000B");
    expect(violations[1]).toContain(":4:");
    expect(violations[1]).toContain("U+200B");
  });
});

describe("lintFiles", () => {
  it("returns empty array when all records are clean", () => {
    const files: FileRecord[] = [
      { name: "a.ts", content: "clean content" },
      { name: "b.ts", content: "also clean\nwith newlines" },
    ];
    expect(lintFiles(files)).toHaveLength(0);
  });

  it("aggregates violations across multiple file records", () => {
    const files: FileRecord[] = [
      { name: "a.ts", content: "\u0000 nul here" },
      { name: "b.ts", content: "bidi \u202e here" },
    ];
    expect(lintFiles(files)).toHaveLength(2);
  });

  it("each violation carries the name from its file record", () => {
    const files: FileRecord[] = [
      { name: "path/to/first.ts", content: "\u200b zero-width" },
      { name: "path/to/second.ts", content: "\ufeff bom here" },
    ];
    const violations = lintFiles(files);
    expect(violations).toHaveLength(2);
    expect(violations.find((v) => v.includes("path/to/first.ts"))).toBeDefined();
    expect(violations.find((v) => v.includes("path/to/second.ts"))).toBeDefined();
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
