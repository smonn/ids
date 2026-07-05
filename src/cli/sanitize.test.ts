import { describe, expect, it } from "vitest";
import { redactToken, stripToken } from "./sanitize.js";

describe("stripToken", () => {
  it("returns empty string unchanged", () => {
    expect(stripToken("")).toBe("");
  });

  it("passes through printable ASCII unchanged", () => {
    expect(stripToken("hello world 123")).toBe("hello world 123");
  });

  it("strips NUL (U+0000)", () => {
    expect(stripToken("a\u0000b")).toBe("ab");
  });

  it("strips a mid-C0 char (U+0005, ENQ)", () => {
    expect(stripToken("a\u0005b")).toBe("ab");
  });

  it("strips DEL (U+007F)", () => {
    expect(stripToken("a\u007fb")).toBe("ab");
  });

  it("strips a C1 char (U+0080)", () => {
    expect(stripToken("a\u0080b")).toBe("ab");
  });

  it("strips a bidi mark (U+200B, zero-width space)", () => {
    expect(stripToken("a\u200bb")).toBe("ab");
  });

  it("strips a format char (U+2060, word joiner)", () => {
    expect(stripToken("a\u2060b")).toBe("ab");
  });

  it("strips U+2028 (LINE SEPARATOR)", () => {
    expect(stripToken("a\u2028b")).toBe("ab");
  });

  it("strips U+2029 (PARAGRAPH SEPARATOR)", () => {
    expect(stripToken("a\u2029b")).toBe("ab");
  });

  it("strips BOM (U+FEFF)", () => {
    expect(stripToken("\ufeffhello")).toBe("hello");
  });

  it("strips multiple forbidden chars in one string", () => {
    expect(stripToken("ok\u0000\u200b\u2028!")).toBe("ok!");
  });

  it("leaves newline, tab, and carriage return stripped (they are C0)", () => {
    // \t, \n, \r are all within U+0000-U+001F so stripToken removes them
    expect(stripToken("a\tb\nc\rd")).toBe("abcd");
  });
});

describe("redactToken", () => {
  it("returns empty string unchanged", () => {
    expect(redactToken("")).toBe("");
  });

  it("does not truncate a string of exactly 20 code points", () => {
    const s = "a".repeat(20);
    expect(redactToken(s)).toBe(s);
  });

  it("truncates a string of 21 code points to 20 with trailing ellipsis", () => {
    const s = "a".repeat(21);
    expect(redactToken(s)).toBe("a".repeat(20) + "\u2026");
  });

  it("strips forbidden chars before counting for truncation", () => {
    // 20 'a' chars + NUL → strip gives 20 'a's → no truncation
    expect(redactToken("a".repeat(20) + "\u0000")).toBe("a".repeat(20));
  });

  it("handles surrogate-pair boundary: emoji as 20th code point stays intact", () => {
    // 19 ASCII + emoji (U+1F600, 2 UTF-16 units) + 'b' = 21 code points
    // UTF-16 positions 19 and 20 straddle the emoji surrogates
    // Code-point-aware slice keeps the emoji as the 20th code point intact
    const emoji = "\uD83D\uDE00"; // U+1F600 as surrogate pair literal
    const input = "a".repeat(19) + emoji + "b";
    expect(redactToken(input)).toBe("a".repeat(19) + emoji + "\u2026");
  });
});
