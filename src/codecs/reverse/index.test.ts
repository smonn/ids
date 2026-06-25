import { expect, describe, it, expectTypeOf, vi, beforeAll, afterAll } from "vitest";
import * as fc from "fast-check";
import { createReverseTimestampId } from "./index.js";
import type { Id, JsonSchema } from "../../types.js";

describe("reverse timestamp codec", () => {
  let warnSilencer: ReturnType<typeof vi.spyOn>;
  beforeAll(() => {
    warnSilencer = vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterAll(() => {
    warnSilencer.mockRestore();
  });

  it("roundtrip: extractTimestamp(generate()) returns original ms", () => {
    const fixed = new Date("2026-05-28T12:00:00Z");
    const rev = createReverseTimestampId("rev", { now: () => fixed.getTime() });
    const id = rev.generate();
    expect(rev.extractTimestamp(id)).toEqual(fixed);
  });

  it("ordering: newer ID sorts lexicographically before older ID", () => {
    const t_old = 1_000_000;
    const t_new = 2_000_000;
    const rev = createReverseTimestampId("rev", {
      rng: (target) => target.fill(0x80),
    });
    const id_old = rev.generateAt(new Date(t_old));
    const id_new = rev.generateAt(new Date(t_new));
    expect(id_new < id_old).toBe(true);
  });

  it("property: for many random pairs, newer always sorts before older", () => {
    const rev = createReverseTimestampId("rev");
    for (let i = 0; i < 100; i++) {
      const t_old = Math.floor(Math.random() * 2 ** 47);
      const t_new = t_old + Math.floor(Math.random() * 1_000_000) + 1;
      const id_old = rev.generateAt(new Date(t_old));
      const id_new = rev.generateAt(new Date(t_new));
      expect(id_new < id_old).toBe(true);
    }
  });

  it("extractTimestamp roundtrips at ms=0 (epoch boundary)", () => {
    const rev = createReverseTimestampId("rev", {
      now: () => 0,
      rng: () => {},
    });
    expect(rev.extractTimestamp(rev.generate())).toEqual(new Date(0));
  });

  it("extractTimestamp roundtrips at the 48-bit boundary", () => {
    const maxMs = 2 ** 48 - 1;
    const rev = createReverseTimestampId("rev", {
      now: () => maxMs,
      rng: () => {},
    });
    expect(rev.extractTimestamp(rev.generate())).toEqual(new Date(maxMs));
  });

  it("rejects timestamps that overflow 48 bits", () => {
    const rev = createReverseTimestampId("rev", {
      now: () => 2 ** 48,
      rng: () => {},
    });
    expect(() => rev.generate()).toThrow();
  });

  it("rejects pre-epoch timestamps", () => {
    const rev = createReverseTimestampId("rev", {
      now: () => -1,
      rng: () => {},
    });
    expect(() => rev.generate()).toThrow();
  });

  it("rejects NaN timestamps", () => {
    const rev = createReverseTimestampId("rev", {
      now: () => Number.NaN,
      rng: () => {},
    });
    expect(() => rev.generate()).toThrow();
  });

  it("rejects Infinity timestamp", () => {
    const rev = createReverseTimestampId("rev", {
      now: () => Infinity,
      rng: () => {},
    });
    expect(() => rev.generate()).toThrow();
  });

  it("rejects -Infinity timestamp", () => {
    const rev = createReverseTimestampId("rev", {
      now: () => -Infinity,
      rng: () => {},
    });
    expect(() => rev.generate()).toThrow();
  });

  it("rejects non-integer timestamps", () => {
    const rev = createReverseTimestampId("rev", {
      now: () => 1234.75,
      rng: () => {},
    });
    expect(() => rev.generate()).toThrow();
  });

  it("generateAt() rejects pre-epoch dates", () => {
    const rev = createReverseTimestampId("rev");
    expect(() => rev.generateAt(new Date(-1))).toThrow();
  });

  it("generateAt() rejects dates that overflow 48 bits", () => {
    const rev = createReverseTimestampId("rev");
    expect(() => rev.generateAt(new Date(2 ** 48))).toThrow();
  });

  it("generateAt() rejects an Invalid Date (NaN timestamp)", () => {
    const rev = createReverseTimestampId("rev");
    expect(() => rev.generateAt(new Date(NaN))).toThrow();
  });

  it("generate() output matches expected format", () => {
    const rev = createReverseTimestampId("rev");
    const id = rev.generate();
    expect(id).toMatch(/^rev_[0-9a-hjkmnp-tv-z]{25}[048cgmrw]$/);
  });

  it("generateAt() produces canonical form (lowercase, no aliases)", () => {
    const rev = createReverseTimestampId("rev");
    const id = rev.generateAt(new Date("2024-03-15T12:00:00Z"));
    expect(id).toMatch(/^rev_[0-9a-hjkmnp-tv-z]{25}[048cgmrw]$/);
    expect(rev.is(id)).toBe(true);
  });

  it("is() accepts only canonical form", () => {
    const rev = createReverseTimestampId("rev");
    expect(rev.is("rev_01h7b3k9rqxn1cw3p9r8t2sgkw")).toBe(true);
    expect(rev.is("REV_01H7B3K9RQXN1CW3P9R8T2SGKW")).toBe(false);
    expect(rev.is("rev_Olh7b3k9rqxnIcw3p9r8t2sgkw")).toBe(false);
  });

  it("is() does not accept malformed inputs", () => {
    const rev = createReverseTimestampId("rev");
    expect(rev.is(null)).toBe(false);
    expect(rev.is("")).toBe(false);
    expect(rev.is("rev_")).toBe(false);
    expect(rev.is("rev_!!!")).toBe(false);
    expect(rev.is("rev_" + "a".repeat(25))).toBe(false);
  });

  it("is() returns false for all 3 non-canonical final-char variants", () => {
    const rev = createReverseTimestampId("rev", { allowDuplicateBrand: true });
    expect(rev.is("rev_00000000000000000000000000")).toBe(true);
    expect(rev.is("rev_00000000000000000000000001")).toBe(false);
    expect(rev.is("rev_00000000000000000000000002")).toBe(false);
    expect(rev.is("rev_00000000000000000000000003")).toBe(false);
  });

  it("parse() normalises lenient input to canonical form", () => {
    const rev = createReverseTimestampId("rev");
    expect(rev.parse("REV_01H7B3K9rqxn4cw3p9r8t2sgkw")).toEqual("rev_01h7b3k9rqxn4cw3p9r8t2sgkw");
    expect(rev.parse("rev_Olh7b3k9rqxnIcw3p9r8t2sgkw")).toEqual("rev_01h7b3k9rqxn1cw3p9r8t2sgkw");
  });

  it("safeParse() returns canonical form on success", () => {
    const rev = createReverseTimestampId("rev");
    expect(rev.safeParse("rev_Olh7b3k9rqxnIcw3p9r8t2sgkw")).toEqual({
      ok: true,
      id: "rev_01h7b3k9rqxn1cw3p9r8t2sgkw",
    });
  });

  it("safeParse() fails on bad input", () => {
    const rev = createReverseTimestampId("rev");
    expect(rev.safeParse(null)).toEqual({ ok: false, error: "not_string" });
    expect(rev.safeParse("org_Olh7b3k9rqxnIcw3p9r8t2sgkw")).toEqual({
      ok: false,
      error: "invalid_prefix",
    });
    expect(rev.safeParse("rev_01h7b3k9rqxn1cw3p9r8t2sgk!")).toEqual({
      ok: false,
      error: "invalid_base32",
    });
  });

  it("safeParse() rejects all 3 non-canonical final-char variants as invalid_base32", () => {
    const rev = createReverseTimestampId("rev", { allowDuplicateBrand: true });
    expect(rev.safeParse("rev_00000000000000000000000001")).toEqual({
      ok: false,
      error: "invalid_base32",
    });
    expect(rev.safeParse("rev_00000000000000000000000002")).toEqual({
      ok: false,
      error: "invalid_base32",
    });
    expect(rev.safeParse("rev_00000000000000000000000003")).toEqual({
      ok: false,
      error: "invalid_base32",
    });
  });

  it("fails if brand is not exactly three a-z characters", () => {
    // @ts-expect-error — "a" (1 char) is not a valid brand; ValidBrand<"a"> = never
    expect(() => createReverseTimestampId("a")).toThrow();
    // @ts-expect-error — "aaaa" (4 chars) is not a valid brand; ValidBrand<"aaaa"> = never
    expect(() => createReverseTimestampId("aaaa")).toThrow();
    // @ts-expect-error — "!@?" (non-alpha) is not a valid brand; ValidBrand<"!@?"> = never
    expect(() => createReverseTimestampId("!@?")).toThrow();
  });

  it("cross-brand rejection", () => {
    const org = createReverseTimestampId("org");
    const rev = createReverseTimestampId("rev");
    const orgId = org.generate();
    expect(rev.is(orgId)).toBe(false);
    expect(() => rev.parse(orgId)).toThrow();
  });

  describe("minIdForTime and maxIdForTime", () => {
    it.each([0, 1, 0x123456789abc, 2 ** 48 - 1])(
      "minIdForTime() round-trips through extractTimestamp at ms=%d",
      (ms) => {
        const rev = createReverseTimestampId("rev");
        const d = new Date(ms);
        expect(rev.extractTimestamp(rev.minIdForTime(d))).toEqual(d);
      },
    );

    it.each([0, 1, 0x123456789abc, 2 ** 48 - 1])(
      "maxIdForTime() round-trips through extractTimestamp at ms=%d",
      (ms) => {
        const rev = createReverseTimestampId("rev");
        const d = new Date(ms);
        expect(rev.extractTimestamp(rev.maxIdForTime(d))).toEqual(d);
      },
    );

    it("minIdForTime(d) <= generate() <= maxIdForTime(d) with a deterministic rng", () => {
      const d = new Date("2026-05-28T12:00:00Z");
      const rev = createReverseTimestampId("rev", {
        now: () => d.getTime(),
        rng: (target) => target.fill(0x80),
      });
      const min = rev.minIdForTime(d);
      const max = rev.maxIdForTime(d);
      const id = rev.generate();
      expect(min <= id).toBe(true);
      expect(id <= max).toBe(true);
    });

    it("minIdForTime(d) equals a zero-RNG generateAt() at the same time (tight lower bound)", () => {
      const ms = 0x123456789abc;
      const rev = createReverseTimestampId("rev", { rng: (target) => target.fill(0x00) });
      expect(rev.minIdForTime(new Date(ms))).toBe(rev.generateAt(new Date(ms)));
    });

    it("maxIdForTime(d) equals an all-0xFF-RNG generateAt() at the same time (tight upper bound)", () => {
      const ms = 0x123456789abc;
      const rev = createReverseTimestampId("rev", { rng: (target) => target.fill(0xff) });
      expect(rev.maxIdForTime(new Date(ms))).toBe(rev.generateAt(new Date(ms)));
    });

    it("minIdForTime(t) < maxIdForTime(t) (random portion distinguishes bounds)", () => {
      const rev = createReverseTimestampId("rev");
      const d = new Date("2026-05-28T12:00:00Z");
      expect(rev.minIdForTime(d) < rev.maxIdForTime(d)).toBe(true);
    });

    it("minIdForTime(t_new) < minIdForTime(t_old) (reversed ordering: newer sorts first)", () => {
      const rev = createReverseTimestampId("rev");
      const t_old = new Date(1_000_000);
      const t_new = new Date(2_000_000);
      expect(rev.minIdForTime(t_new) < rev.minIdForTime(t_old)).toBe(true);
    });

    it("minIdForTime() rejects pre-epoch dates", () => {
      const rev = createReverseTimestampId("rev");
      expect(() => rev.minIdForTime(new Date(-1))).toThrow();
    });

    it("maxIdForTime() rejects pre-epoch dates", () => {
      const rev = createReverseTimestampId("rev");
      expect(() => rev.maxIdForTime(new Date(-1))).toThrow();
    });

    it("minIdForTime() rejects dates that overflow 48 bits", () => {
      const rev = createReverseTimestampId("rev");
      expect(() => rev.minIdForTime(new Date(2 ** 48))).toThrow();
    });

    it("maxIdForTime() rejects dates that overflow 48 bits", () => {
      const rev = createReverseTimestampId("rev");
      expect(() => rev.maxIdForTime(new Date(2 ** 48))).toThrow();
    });

    it("minIdForTime() rejects an Invalid Date", () => {
      const rev = createReverseTimestampId("rev");
      expect(() => rev.minIdForTime(new Date(NaN))).toThrow();
    });

    it("maxIdForTime() rejects an Invalid Date", () => {
      const rev = createReverseTimestampId("rev");
      expect(() => rev.maxIdForTime(new Date(NaN))).toThrow();
    });
  });

  describe("toJsonSchema", () => {
    it("returns a string schema with pattern, description, and example", () => {
      const rev = createReverseTimestampId("rev");
      const schema = rev.toJsonSchema();
      expect(schema.type).toBe("string");
      expect(typeof schema.pattern).toBe("string");
      expect(typeof schema.description).toBe("string");
      expect(typeof schema.example).toBe("string");
    });

    it("pattern is anchored and brand-specific", () => {
      const rev = createReverseTimestampId("rev");
      expect(rev.toJsonSchema().pattern).toBe("^rev_[0-9a-hjkmnp-tv-z]{25}[048cgmrw]$");
    });

    it("example matches the pattern and is() returns true", () => {
      const rev = createReverseTimestampId("rev");
      const schema = rev.toJsonSchema();
      expect(new RegExp(schema.pattern).test(schema.example)).toBe(true);
      expect(rev.is(schema.example)).toBe(true);
    });

    it("toJsonSchema() return type is the exported JsonSchema type", () => {
      const rev = createReverseTimestampId("rev");
      expectTypeOf(rev.toJsonSchema()).toEqualTypeOf<JsonSchema>();
    });
  });

  describe("standard schema adapter", () => {
    it("exposes ~standard with version 1 and vendor '@smonn/ids'", () => {
      const rev = createReverseTimestampId("rev");
      expect(rev["~standard"].version).toBe(1);
      expect(rev["~standard"].vendor).toBe("@smonn/ids");
    });

    it("validate() returns { value: canonical } on lenient success", () => {
      const rev = createReverseTimestampId("rev");
      expect(rev["~standard"].validate("rev_Olh7b3k9rqxnIcw3p9r8t2sgkw")).toEqual({
        value: "rev_01h7b3k9rqxn1cw3p9r8t2sgkw",
      });
    });

    it("validate() reports non-string input", () => {
      const rev = createReverseTimestampId("rev");
      expect(rev["~standard"].validate(123)).toEqual({
        issues: [{ message: "expected string" }],
      });
    });

    it("validate() reports wrong prefix", () => {
      const rev = createReverseTimestampId("rev");
      expect(rev["~standard"].validate("org_01h7b3k9rqxn1cw3p9r8t2sgkw")).toEqual({
        issues: [{ message: "expected prefix 'rev_'" }],
      });
    });

    it("~standard.types.output infers Id<Brand>", () => {
      const rev = createReverseTimestampId("rev");
      type Output = NonNullable<(typeof rev)["~standard"]["types"]>["output"];
      expectTypeOf<Output>().toEqualTypeOf<Id<"rev">>();
    });
  });

  it("generate() called many times will always generate distinct values", () => {
    const rev = createReverseTimestampId("rev");
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      const id = rev.generate();
      expect(ids.has(id)).toBe(false);
      ids.add(id);
    }
  });

  describe("golden vectors", () => {
    // Reverse timestamp inverts the 48-bit field before encoding: ~ts & 0xFFFFFFFFFFFF.
    // Fixed inputs: ts=0x123456789abc, rng writes 0xff only at random byte 9
    // (matches the non-symmetric known-answer pattern used in timestamp/index.test.ts).
    it("non-symmetric known-answer encoding", () => {
      const rev = createReverseTimestampId("rev", {
        now: () => 0x123456789abc,
        rng: (target) => {
          target[9] = 0xff;
        },
        allowDuplicateBrand: true,
      });
      expect(rev.generate()).toBe("rev_xq5tk1v58c00000000000000zw");
    });

    it("non-symmetric known-answer decoding (independent of encoder)", () => {
      const rev = createReverseTimestampId("rev", { allowDuplicateBrand: true });
      const id = "rev_xq5tk1v58c00000000000000zw" as Id<"rev">;
      expect(rev.extractTimestamp(id)).toEqual(new Date(0x123456789abc));
    });
  });

  describe("fast-check property tests", () => {
    it("round-trip: generateAt at arbitrary valid ms yields same timestamp via extractTimestamp", () => {
      const rev = createReverseTimestampId("rev", { allowDuplicateBrand: true });
      fc.assert(
        fc.property(fc.integer({ min: 0, max: 2 ** 48 - 1 }), (ms) => {
          const id = rev.generateAt(new Date(ms));
          return rev.extractTimestamp(id).getTime() === ms;
        }),
      );
    });

    it("safeParse never throws on arbitrary input", () => {
      const rev = createReverseTimestampId("rev", { allowDuplicateBrand: true });
      fc.assert(
        fc.property(fc.string(), (s) => {
          rev.safeParse(s);
          return true;
        }),
      );
    });

    it("safeParse: when ok, returned id satisfies is()", () => {
      const rev = createReverseTimestampId("rev", { allowDuplicateBrand: true });
      fc.assert(
        fc.property(fc.string(), (s) => {
          const r = rev.safeParse(s);
          return !r.ok || rev.is(r.id);
        }),
      );
    });
  });
});
