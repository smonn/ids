import { describe, expect, it } from "vitest";
import { checkContent, lintFiles, loadTrackedFiles } from "./source-hygiene-lint.mjs";

// Use String.fromCodePoint() to avoid embedding raw code points in this source file.
const NUL = String.fromCodePoint(0x0000);
const C0_MID = String.fromCodePoint(0x0005);
const C0_VT = String.fromCodePoint(0x000b);
const C1 = String.fromCodePoint(0x0080);
const ZWSP = String.fromCodePoint(0x200b);
const LINE_SEP = String.fromCodePoint(0x2028);
const PARA_SEP = String.fromCodePoint(0x2029);
const BIDI = String.fromCodePoint(0x202a);
const FORMAT = String.fromCodePoint(0x2060);
const BOM = String.fromCodePoint(0xfeff);

describe("checkContent", () => {
  it("returns no violations for clean ASCII content", () => {
    expect(checkContent("hello world\n", "f.ts")).toEqual([]);
  });

  it("allows tab, LF, and CR (excluded from the forbidden set)", () => {
    const tab = String.fromCodePoint(0x0009);
    const lf = String.fromCodePoint(0x000a);
    const cr = String.fromCodePoint(0x000d);
    expect(checkContent("a" + tab + "b" + lf + "c" + cr + "d\n", "f.ts")).toEqual([]);
  });

  it("flags NUL (U+0000)", () => {
    const v = checkContent("a" + NUL + "b", "x.ts");
    expect(v).toHaveLength(1);
    expect(v[0]).toMatch(/U\+0000/);
    expect(v[0]).toContain("x.ts:1:");
  });

  it("flags a mid-C0 control char (U+0005, ENQ)", () => {
    const v = checkContent(C0_MID + "hello", "x.ts");
    expect(v).toHaveLength(1);
    expect(v[0]).toMatch(/U\+0005/);
  });

  it("flags VT (U+000B, C0 vertical-tab)", () => {
    const v = checkContent("a" + C0_VT + "b", "x.ts");
    expect(v).toHaveLength(1);
    expect(v[0]).toMatch(/U\+000B/);
  });

  it("flags a C1 control char (U+0080)", () => {
    const v = checkContent("a" + C1 + "b", "x.ts");
    expect(v).toHaveLength(1);
    expect(v[0]).toMatch(/U\+0080/);
  });

  it("flags zero-width space (U+200B, bidi/zero-width range)", () => {
    const v = checkContent("a" + ZWSP + "b", "x.ts");
    expect(v).toHaveLength(1);
    expect(v[0]).toMatch(/U\+200B/);
  });

  it("flags LINE SEPARATOR (U+2028)", () => {
    const v = checkContent("a" + LINE_SEP + "b", "x.ts");
    expect(v).toHaveLength(1);
    expect(v[0]).toMatch(/U\+2028/);
  });

  it("flags PARAGRAPH SEPARATOR (U+2029)", () => {
    const v = checkContent("a" + PARA_SEP + "b", "x.ts");
    expect(v).toHaveLength(1);
    expect(v[0]).toMatch(/U\+2029/);
  });

  it("flags a bidi embedding char (U+202A)", () => {
    const v = checkContent("a" + BIDI + "b", "x.ts");
    expect(v).toHaveLength(1);
    expect(v[0]).toMatch(/U\+202A/);
  });

  it("flags a format char (U+2060, word joiner)", () => {
    const v = checkContent("a" + FORMAT + "b", "x.ts");
    expect(v).toHaveLength(1);
    expect(v[0]).toMatch(/U\+2060/);
  });

  it("flags BOM (U+FEFF)", () => {
    const v = checkContent(BOM + "hello", "x.ts");
    expect(v).toHaveLength(1);
    expect(v[0]).toMatch(/U\+FEFF/);
  });

  it("reports the correct line number for a violation on line 2", () => {
    const v = checkContent("clean\n" + NUL + "bad", "f.ts");
    expect(v).toHaveLength(1);
    expect(v[0]).toContain("f.ts:2:");
  });

  it("reports multiple violations in the same file", () => {
    const v = checkContent(NUL + "x" + ZWSP + "y\n" + C1 + "z", "f.ts");
    expect(v).toHaveLength(3);
  });

  it("does not flag backslash-u escape sequences (they are ASCII, not raw code points)", () => {
    // The six ASCII characters backslash u 0 0 0 0 are NOT a forbidden code point.
    expect(checkContent("const x = '\\u0000';", "f.ts")).toEqual([]);
  });
});

describe("lintFiles", () => {
  it("returns no violations for a clean file set", () => {
    const files = [
      { name: "a.ts", content: "const x = 1;\n" },
      { name: "b.ts", content: "export {};\n" },
    ];
    expect(lintFiles(files)).toEqual([]);
  });

  it("returns all violations across multiple files", () => {
    const files = [
      { name: "a.ts", content: NUL + "x" },
      { name: "b.ts", content: "y" + C1 + "z" },
    ];
    const v = lintFiles(files);
    expect(v).toHaveLength(2);
    expect(v.some((e) => e.includes("a.ts"))).toBe(true);
    expect(v.some((e) => e.includes("b.ts"))).toBe(true);
  });
});

describe("loadTrackedFiles + lintFiles (integration)", () => {
  it("produces no violations against the real repository", () => {
    const files = loadTrackedFiles();
    expect(files.length).toBeGreaterThan(0);
    const violations = lintFiles(files);
    expect(violations).toEqual([]);
  });
});
