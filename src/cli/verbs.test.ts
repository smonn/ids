import { describe, expect, it } from "vitest";
import { IdsError } from "../error.js";
import type { CodecKey } from "./key.js";
import type { RunOpts } from "./types.js";
import type { InspectSpec } from "./verbs.js";
import { redactToken } from "./sanitize.js";
import { brandOfId, mapThrown, runGenerateKeyless, runWrap } from "./verbs.js";

describe("mapThrown", () => {
  const usageCodes = [
    "invalid_brand",
    "invalid_key_format",
    "invalid_key_encoding",
    "invalid_key_length",
    "invalid_kind",
    "invalid_lookup_key",
    "invalid_namespace",
    "invalid_timestamp",
  ] as const;

  const runtimeCodes = [
    "empty_keyring",
    "duplicate_keyring_entry",
    "verification_failed",
    "invalid_id",
  ] as const;

  for (const code of usageCodes) {
    it(`maps IdsError(${code}) to usage`, () => {
      expect(mapThrown(new IdsError(code, "msg")).kind).toBe("usage");
    });
  }

  for (const code of runtimeCodes) {
    it(`maps IdsError(${code}) to runtime`, () => {
      expect(mapThrown(new IdsError(code, "msg")).kind).toBe("runtime");
    });
  }

  it("maps an unknown error to runtime", () => {
    expect(mapThrown(new Error("boom")).kind).toBe("runtime");
  });
});

describe("brandOfId", () => {
  it("extracts a lowercased brand from a well-formed id", () => {
    expect(brandOfId("USR_06f8")).toBe("usr");
  });

  it("returns undefined for a non-id token", () => {
    expect(brandOfId("not-an-id")).toBeUndefined();
  });
});

describe("redactToken", () => {
  it("returns tokens of 20 chars unchanged", () => {
    expect(redactToken("a".repeat(20))).toBe("a".repeat(20));
  });

  it("truncates tokens longer than 20 chars with ellipsis", () => {
    expect(redactToken("a".repeat(21))).toBe("a".repeat(20) + "…");
  });

  it("returns short tokens unchanged", () => {
    expect(redactToken("short")).toBe("short");
  });

  it("strips C0/C1/ESC control characters before truncation", () => {
    expect(redactToken("\x1b]0;pwned\x07")).toBe("]0;pwned");
  });

  it("strips control chars then truncates if remainder exceeds 20 chars", () => {
    expect(redactToken("\x1b" + "a".repeat(21))).toBe("a".repeat(20) + "…");
  });

  it("strips DEL (U+007F) and C1 range (U+0080–U+009F)", () => {
    expect(redactToken("\x7fhello\x80world\x9f")).toBe("helloworld");
  });

  it("strips Unicode bidi/format controls (U+202E RLO)", () => {
    expect(redactToken("\u202EEVIL")).toBe("EVIL");
  });

  it("truncates to 20 Unicode code points without splitting a surrogate pair", () => {
    const emoji = String.fromCodePoint(0x1f600); // 😀 — 2 UTF-16 units, 1 code point
    // 20 'a' + 1 emoji = 21 code points: truncate to 20 a + ellipsis (emoji is dropped whole)
    const result = redactToken("a".repeat(20) + emoji);
    expect(result).toBe("a".repeat(20) + "…");
    expect(result).not.toMatch(/[\uD800-\uDFFF]$/);
  });
});

describe("hostile-bytes redaction in verb error messages", () => {
  function runOpts(err: string[]): RunOpts {
    return { argv: [], stdout: () => {}, stderr: (s) => err.push(s) };
  }

  const dummyKey: CodecKey<{ b: Uint8Array }> = {
    decode: () => new Uint8Array(32),
    import: (b) => ({ b }),
  };

  it("strips control chars from --at invalid-date error (verbs.ts:75)", async () => {
    const err: string[] = [];
    const code = await runGenerateKeyless(
      () => ({ generate: () => "", generateAt: () => "" }),
      ["usr", "--at", "not-a-date\x1b]0;x\x07"],
      runOpts(err),
    );
    expect(code).toBe(2);
    expect(err.join("")).toContain("invalid date");
    expect(err.join("")).not.toContain("\x1b");
    expect(err.join("")).not.toContain("\x07");
  });

  it("strips control chars from --value integer error for u32/i32 (verbs.ts:337)", async () => {
    const err: string[] = [];
    const code = await runWrap(
      dummyKey,
      () => ({ wrap: () => Promise.resolve("x_01") }),
      ["ord", "--kind", "u32", "--value", "abc\x1b]0;x\x07"],
      runOpts(err),
    );
    expect(code).toBe(2);
    expect(err.join("")).toContain("must be an integer");
    expect(err.join("")).not.toContain("\x1b");
    expect(err.join("")).not.toContain("\x07");
  });

  it("strips control chars from --value integer error for u64/i64 (verbs.ts:348)", async () => {
    const err: string[] = [];
    const code = await runWrap(
      dummyKey,
      () => ({ wrap: () => Promise.resolve("x_01") }),
      ["ord", "--kind", "u64", "--value", "abc\x1b]0;x\x07"],
      runOpts(err),
    );
    expect(code).toBe(2);
    expect(err.join("")).toContain("must be an integer");
    expect(err.join("")).not.toContain("\x1b");
    expect(err.join("")).not.toContain("\x07");
  });
});

// Type-level check: constructing a keyed:true InspectSpec without codecKey is a type error.
// @ts-expect-error -- codecKey is required when keyed: true
const _badSpec: InspectSpec<string> = {
  keyed: true,
  prepare: () => () =>
    Promise.resolve({ shape: "timestamp" as const, brand: "x", codec: "x", ms: 0, uuid: "" }),
};
