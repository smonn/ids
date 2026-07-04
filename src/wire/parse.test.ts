import { describe, expect, it } from "vitest";
import { safeParse, is, standardValidate } from "./parse.js";
import type { Id } from "../types.js";

const PREFIX = "usr_" as const;
type Brand = "usr";

// Canonical 26-char payload: 25 chars from alphabet + final char from [048cgmrw].
// "0" satisfies both constraints.
const CANONICAL_PAYLOAD = "0".repeat(26);
const CANONICAL_ID = `${PREFIX}${CANONICAL_PAYLOAD}` as Id<Brand>;

describe("safeParse", () => {
  it("accepts a fully canonical input and returns ok with the id", () => {
    expect(safeParse(PREFIX, CANONICAL_ID)).toEqual({ ok: true, id: CANONICAL_ID });
  });

  it("normalises uppercase payload chars to lowercase", () => {
    // "A" is a valid canonical char after lowercasing; last char "0" satisfies padding.
    const uppercase = `${PREFIX}${"A".repeat(25)}0`;
    const result = safeParse(PREFIX, uppercase);
    expect(result).toEqual({ ok: true, id: `${PREFIX}${"a".repeat(25)}0` });
  });

  it("normalises Crockford alias 'o' (→ '0') in payload", () => {
    // is() must reject this; safeParse must normalise.
    const withAlias = `${PREFIX}o${"0".repeat(25)}`;
    expect(safeParse(PREFIX, withAlias)).toEqual({ ok: true, id: CANONICAL_ID });
  });

  it("normalises Crockford alias 'i' (→ '1') in payload", () => {
    // 26 'i' chars normalise to 26 '1' chars, but the last char must be in
    // [048cgmrw]. '1' is not in that set, so the normalised form is invalid.
    // Verify this fails correctly, then pick an input where '1' lands in a
    // non-final position.
    const withI = `${PREFIX}i${"0".repeat(25)}`;
    // After normalisation: "1" + "0".repeat(25) — last char "0" ∈ [048cgmrw] ✓
    expect(safeParse(PREFIX, withI)).toEqual({
      ok: true,
      id: `${PREFIX}1${"0".repeat(25)}`,
    });
  });

  it("normalises Crockford alias 'l' (→ '1') in payload", () => {
    const withL = `${PREFIX}l${"0".repeat(25)}`;
    expect(safeParse(PREFIX, withL)).toEqual({
      ok: true,
      id: `${PREFIX}1${"0".repeat(25)}`,
    });
  });

  it("normalises an all-alias payload ('o'.repeat(26)) to the all-'0' canonical form", () => {
    const allAliases = `${PREFIX}${"o".repeat(26)}`;
    expect(safeParse(PREFIX, allAliases)).toEqual({ ok: true, id: CANONICAL_ID });
  });

  it("rejects a non-ASCII payload char (U+212A KELVIN SIGN) with invalid_base32", () => {
    // toLowerCase() folds U+212A → 'k', which would let this alias to a valid id;
    // SPEC canonicalization is ASCII-only, so it must be rejected at the base32 layer.
    const kelvin = `${PREFIX}K${"k".repeat(24)}0`;
    expect(safeParse(PREFIX, kelvin)).toEqual({ ok: false, error: "invalid_base32" });
  });

  it("rejects an oversized payload (27 chars) with invalid_base32", () => {
    const oversized = `${PREFIX}${"0".repeat(27)}`;
    expect(safeParse(PREFIX, oversized)).toEqual({ ok: false, error: "invalid_base32" });
  });

  it("rejects a very long string (well beyond canonical max) with invalid_base32 without normalizing", () => {
    // Length guard fires first: a 1000-char payload is rejected in O(1) without
    // folding or regex-testing the payload — only the fixed prefix slice is
    // inspected, and here the prefix is correct so the layer is base32.
    const veryLong = `${PREFIX}${"0".repeat(1000)}`;
    expect(safeParse(PREFIX, veryLong)).toEqual({ ok: false, error: "invalid_base32" });
  });

  it("rejects an overlong input with a WRONG prefix at the prefix layer", () => {
    // Overlong trips the O(1) length guard, but the prefix failed first: SPEC's
    // first-failing-layer rule requires a prefix-layer rejection, not base32.
    const overlongWrongPrefix = `org_${"0".repeat(27)}`;
    expect(safeParse(PREFIX, overlongWrongPrefix)).toEqual({
      ok: false,
      error: "invalid_prefix",
    });
  });

  it("rejects an overlong input with a CORRECT prefix at the base32 layer", () => {
    // Prefix passed; the oversized payload is the first failure → base32 layer.
    const overlongRightPrefix = `${PREFIX}${"0".repeat(27)}`;
    expect(safeParse(PREFIX, overlongRightPrefix)).toEqual({
      ok: false,
      error: "invalid_base32",
    });
  });

  it("rejects an undersized payload (25 chars) with invalid_base32", () => {
    const undersized = `${PREFIX}${"0".repeat(25)}`;
    expect(safeParse(PREFIX, undersized)).toEqual({ ok: false, error: "invalid_base32" });
  });

  it("rejects a payload whose final char has non-zero padding bits with invalid_base32", () => {
    // '1' is not in [048cgmrw], so the 2 surplus bits are non-zero.
    const badPadding = `${PREFIX}${"0".repeat(25)}1`;
    expect(safeParse(PREFIX, badPadding)).toEqual({ ok: false, error: "invalid_base32" });
  });

  it("rejects a non-matching prefix with invalid_prefix", () => {
    const wrongPrefix = `org_${CANONICAL_PAYLOAD}`;
    expect(safeParse(PREFIX, wrongPrefix)).toEqual({ ok: false, error: "invalid_prefix" });
  });

  it("rejects an empty string with invalid_prefix", () => {
    expect(safeParse(PREFIX, "")).toEqual({ ok: false, error: "invalid_prefix" });
  });

  it("rejects null (non-string) with not_string", () => {
    expect(safeParse(PREFIX, null)).toEqual({ ok: false, error: "not_string" });
  });

  it("rejects a number (non-string) with not_string", () => {
    expect(safeParse(PREFIX, 42)).toEqual({ ok: false, error: "not_string" });
  });

  it("rejects undefined (non-string) with not_string", () => {
    expect(safeParse(PREFIX, undefined)).toEqual({ ok: false, error: "not_string" });
  });
});

describe("is", () => {
  it("returns true for a canonical id", () => {
    expect(is(PREFIX, CANONICAL_ID)).toBe(true);
  });

  it("returns false for a payload containing the alias 'o' (canonical would be '0')", () => {
    // safeParse accepts this; is() must reject it.
    const withAlias = `${PREFIX}o${"0".repeat(25)}`;
    expect(is(PREFIX, withAlias)).toBe(false);
    // Confirm safeParse does accept it.
    expect(safeParse(PREFIX, withAlias)).toEqual({ ok: true, id: CANONICAL_ID });
  });

  it("returns false for a payload containing uppercase chars (canonical would be lowercase)", () => {
    const uppercase = `${PREFIX}${"A".repeat(25)}0`;
    expect(is(PREFIX, uppercase)).toBe(false);
    expect(safeParse(PREFIX, uppercase)).toEqual({
      ok: true,
      id: `${PREFIX}${"a".repeat(25)}0`,
    });
  });

  it("returns false for an all-alias payload that safeParse normalises", () => {
    const allAliases = `${PREFIX}${"o".repeat(26)}`;
    expect(is(PREFIX, allAliases)).toBe(false);
    expect(safeParse(PREFIX, allAliases)).toEqual({ ok: true, id: CANONICAL_ID });
  });

  it("returns false for an oversized payload (27 chars)", () => {
    expect(is(PREFIX, `${PREFIX}${"0".repeat(27)}`)).toBe(false);
  });

  it("returns false for an undersized payload (25 chars)", () => {
    expect(is(PREFIX, `${PREFIX}${"0".repeat(25)}`)).toBe(false);
  });

  it("returns false for an empty string", () => {
    expect(is(PREFIX, "")).toBe(false);
  });

  it("returns false for null (non-string)", () => {
    expect(is(PREFIX, null)).toBe(false);
  });

  it("returns false for a number (non-string)", () => {
    expect(is(PREFIX, 42)).toBe(false);
  });
});

describe("standardValidate", () => {
  it("returns { value } for a valid canonical id", () => {
    expect(standardValidate(PREFIX, CANONICAL_ID)).toEqual({ value: CANONICAL_ID });
  });

  it("returns issues for not_string (non-string input)", () => {
    expect(standardValidate(PREFIX, 99)).toEqual({
      issues: [{ message: "expected string" }],
    });
  });

  it("returns issues for invalid_prefix (wrong brand)", () => {
    const wrongBrand = `org_${CANONICAL_PAYLOAD}`;
    expect(standardValidate(PREFIX, wrongBrand)).toEqual({
      issues: [{ message: `expected prefix '${PREFIX}'` }],
    });
  });

  it("returns issues for invalid_base32 (oversized payload)", () => {
    const oversized = `${PREFIX}${"0".repeat(27)}`;
    expect(standardValidate(PREFIX, oversized)).toEqual({
      issues: [{ message: "invalid base32 payload" }],
    });
  });
});
