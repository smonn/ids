import { fromAny } from "@total-typescript/shoehorn";
import {
  expect,
  describe,
  it,
  expectTypeOf,
  vi,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from "vitest";
import * as fc from "fast-check";
import { decodeBase32, encodeBase32 } from "../../wire/base32.js";
import { createTimestampId, type TimestampOptions } from "./index.js";
import { IdsError, isIdsError } from "../../error.js";
import type { Id, JsonSchema, LayoutOps } from "../../types.js";

describe("id", () => {
  // These tests recreate many codecs for the same brand. That's intentional —
  // they're testing the codec contract, not the duplicate-brand heuristic. The
  // dedicated heuristic tests live in the describe block below.
  let warnSilencer: ReturnType<typeof vi.spyOn>;
  beforeAll(() => {
    warnSilencer = vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterAll(() => {
    warnSilencer.mockRestore();
  });

  it("roundtrip", () => {
    const fixed = new Date("2026-05-28T12:00:00Z");
    const usr = createTimestampId("usr", { now: () => fixed.getTime() });
    const id = usr.generate();
    expect(usr.extractTimestamp(id)).toEqual(fixed);
  });

  it("deterministic snapshot", () => {
    const usr = createTimestampId("usr", {
      now: () => 0,
      rng: () => {},
    });
    expect(usr.generate()).toBe("usr_" + "0".repeat(26)); // adjust to actual
  });

  it("non-symmetric known-answer encoding", () => {
    // Buffer: timestamp 0x123456789abc, 9 zero random bytes, last byte 0xff.
    // Non-zero last byte exercises the tail-emit shift; non-symmetric timestamp
    // exercises the main loop across every 5-bit alignment.
    const usr = createTimestampId("usr", {
      now: () => 0x123456789abc,
      rng: (target) => {
        target[9] = 0xff;
      },
    });
    expect(usr.generate()).toBe("usr_28t5cy4tqg00000000000000zw");
  });

  it("non-symmetric known-answer decoding", () => {
    // Inverse: decode a hard-coded string and recover the exact ms.
    // Independent of the encoder so a decoder-only bug can't be masked by a
    // compensating encoder bug.
    const usr = createTimestampId("usr");
    const id = "usr_28t5cy4tqg00000000000000zw" as Id<"usr">;
    expect(usr.extractTimestamp(id)).toEqual(new Date(0x123456789abc));
  });

  it("extracts ms=0 (epoch boundary)", () => {
    const usr = createTimestampId("usr", {
      now: () => 0,
      rng: () => {},
    });
    expect(usr.extractTimestamp(usr.generate())).toEqual(new Date(0));
  });

  it("extracts ms at the 48-bit boundary", () => {
    const maxMs = 2 ** 48 - 1;
    const usr = createTimestampId("usr", {
      now: () => maxMs,
      rng: () => {},
    });
    expect(usr.extractTimestamp(usr.generate())).toEqual(new Date(maxMs));
  });

  it("rejects timestamps that overflow 48 bits", () => {
    const usr = createTimestampId("usr", {
      now: () => 2 ** 48,
      rng: () => {},
    });
    expect(() => usr.generate()).toThrow();
  });

  it("rejects pre-epoch timestamps", () => {
    const usr = createTimestampId("usr", {
      now: () => -1,
      rng: () => {},
    });
    expect(() => usr.generate()).toThrow();
  });

  it("rejects Infinity timestamp", () => {
    const usr = createTimestampId("usr", {
      now: () => Infinity,
      rng: () => {},
    });
    expect(() => usr.generate()).toThrow();
  });

  it("rejects -Infinity timestamp", () => {
    const usr = createTimestampId("usr", {
      now: () => -Infinity,
      rng: () => {},
    });
    expect(() => usr.generate()).toThrow();
  });

  it("rejects non-integer timestamps", () => {
    const usr = createTimestampId("usr", {
      now: () => 1234.75,
      rng: () => {},
    });
    expect(() => usr.generate()).toThrow();
  });

  it("handles maximal random bytes", () => {
    const usr = createTimestampId("usr", {
      now: () => 0,
      rng: (target) => target.fill(0xff),
    });
    const id = usr.generate();
    expect(usr.is(id)).toBe(true);
    expect(usr.extractTimestamp(id)).toEqual(new Date(0));
  });

  it("falls back to the default rng when the option is explicitly undefined", () => {
    const usr = createTimestampId(
      "usr",
      fromAny({
        now: () => 0,
        rng: undefined,
      }),
    );
    const id = usr.generate();

    expect(usr.is(id)).toBe(true);
    expect(usr.extractTimestamp(id)).toEqual(new Date(0));
  });

  it("falls back to the default now when the option is explicitly undefined", () => {
    const before = Date.now();
    const usr = createTimestampId(
      "usr",
      fromAny({
        now: undefined,
        rng: (target: Uint8Array) => target.fill(0x00),
      }),
    );
    const id = usr.generate();
    const after = Date.now();

    expect(usr.is(id)).toBe(true);
    const timestamp = usr.extractTimestamp(id).getTime();
    expect(timestamp).toBeGreaterThanOrEqual(before);
    expect(timestamp).toBeLessThanOrEqual(after);
  });

  it("default rng harvests exact bytes from crypto.randomUUID via hexCharCodeToNibble table", () => {
    // Stub randomUUID so the default fastTenByteRng runs against a known input.
    // UUID "00112233-4455-4677-8899-aabbccddeeff" exercises both for-loops in
    // src/codecs/_kernel/rng.ts (L9/L10, hexCharCodeToNibble initialization):
    //   digit nibbles '0'-'5' → positions 0-7, 9-12 → bytes 0x00-0x55
    //   letter nibbles 'a'-'d' → positions 24-31 → bytes 0xaa-0xdd
    const spy = vi
      .spyOn(crypto, "randomUUID")
      .mockReturnValue("00112233-4455-4677-8899-aabbccddeeff");
    try {
      const rng = createTimestampId("rng", {
        now: () => 0,
        allowDuplicateBrand: true,
      });
      const id = rng.generate();
      const payload = decodeBase32(id.slice("rng_".length));
      expect(Array.from(payload.slice(0, 6))).toEqual([0, 0, 0, 0, 0, 0]);
      expect(Array.from(payload.slice(6))).toEqual([
        0x00, 0x11, 0x22, 0x33, 0x44, 0x55, 0xaa, 0xbb, 0xcc, 0xdd,
      ]);
    } finally {
      spy.mockRestore();
    }
  });

  it("is() accepts only canonical form", () => {
    const usr = createTimestampId("usr");
    expect(usr.is("usr_01h7b3k9rqxn1cw3p9r8t2sgkw")).toBe(true);
    expect(usr.is("USR_01H7B3K9RQXN1CW3P9R8T2SGKW")).toBe(false); // uppercase
    expect(usr.is("usr_Olh7b3k9rqxnIcw3p9r8t2sgkw")).toBe(false); // contains o/i/l aliases
  });

  // Isolated uppercase-prefix-only rejection: payload is already canonical
  // (lowercase, Crockford-normalized), only the brand prefix is uppercased.
  // Documents that is() is strict/canonical-only and does not case-fold the prefix (ADR-0003).
  it("is() rejects an uppercase brand prefix even when the payload is canonical", () => {
    const usr = createTimestampId("usr", { allowDuplicateBrand: true });
    expect(usr.is("USR_01h7b3k9rqxn1cw3p9r8t2sgkw")).toBe(false);
  });

  // Regression tests for non-canonical trailing-bit variants — ADR-0003, issue #210.
  it("is() returns false for all 3 non-canonical final-char variants", () => {
    const usr = createTimestampId("usr", { allowDuplicateBrand: true });
    expect(usr.is("usr_00000000000000000000000000")).toBe(true); // '0' → canonical
    expect(usr.is("usr_00000000000000000000000001")).toBe(false); // '1' → low 2 bits 01
    expect(usr.is("usr_00000000000000000000000002")).toBe(false); // '2' → low 2 bits 10
    expect(usr.is("usr_00000000000000000000000003")).toBe(false); // '3' → low 2 bits 11
  });

  it("safeParse() rejects all 3 non-canonical final-char variants as invalid_base32", () => {
    const usr = createTimestampId("usr", { allowDuplicateBrand: true });
    expect(usr.safeParse("usr_00000000000000000000000001")).toEqual({
      ok: false,
      error: "invalid_base32",
    });
    expect(usr.safeParse("usr_00000000000000000000000002")).toEqual({
      ok: false,
      error: "invalid_base32",
    });
    expect(usr.safeParse("usr_00000000000000000000000003")).toEqual({
      ok: false,
      error: "invalid_base32",
    });
  });

  it("encodeBase32(decodeBase32(x)) === x for all 8 canonical final-char values and varied real payloads", () => {
    const usr = createTimestampId("usr", { allowDuplicateBrand: true });
    // All 8 canonical final-char values ('0','4','8','c','g','m','r','w').
    for (const finalChar of ["0", "4", "8", "c", "g", "m", "r", "w"]) {
      const id = "usr_0000000000000000000000000" + finalChar;
      const result = usr.safeParse(id);
      expect(result.ok).toBe(true);
      if (result.ok) {
        const base32 = result.id.slice("usr_".length);
        expect(encodeBase32(decodeBase32(base32))).toBe(base32);
      }
    }
    // Deterministic generate() calls with varied non-zero payloads.
    const payloadFixtures: Array<[number, number]> = [
      [0x123456789abc, 0x00],
      [0x123456789abc, 0xff],
      [0x000000000001, 0xab],
      [0xffffffffffff, 0x55],
    ];
    for (const [ts, fill] of payloadFixtures) {
      const codec = createTimestampId("usr", {
        allowDuplicateBrand: true,
        now: () => ts,
        rng: (target: Uint8Array) => target.fill(fill),
      });
      const generated = codec.generate();
      const base32 = generated.slice("usr_".length);
      expect(encodeBase32(decodeBase32(base32))).toBe(base32);
    }
  });

  it("parse() normalises lenient input to canonical form", () => {
    const usr = createTimestampId("usr");
    expect(usr.parse("USR_01H7B3K9rqxn4cw3p9r8t2sgkw")).toEqual("usr_01h7b3k9rqxn4cw3p9r8t2sgkw");
    expect(usr.parse("usr_Olh7b3k9rqxnIcw3p9r8t2sgkw")).toEqual("usr_01h7b3k9rqxn1cw3p9r8t2sgkw");
  });

  it("safeParse() returns canonical form on success", () => {
    const usr = createTimestampId("usr");
    expect(usr.safeParse("usr_Olh7b3k9rqxnIcw3p9r8t2sgkw")).toEqual({
      ok: true,
      id: "usr_01h7b3k9rqxn1cw3p9r8t2sgkw",
    });
  });

  it("safeParse() canonicalises an all-alias base32 portion", () => {
    const usr = createTimestampId("usr");
    expect(usr.safeParse("usr_" + "o".repeat(26))).toEqual({
      ok: true,
      id: "usr_" + "0".repeat(26),
    });
  });

  it("safeParse() fails on bad input", () => {
    const usr = createTimestampId("usr");
    expect(usr.safeParse(null)).toEqual({ ok: false, error: "not_string" });
    expect(usr.safeParse("org_Olh7b3k9rqxnIcw3p9r8t2sgkw")).toEqual({
      ok: false,
      error: "invalid_prefix",
    });
    expect(usr.safeParse("usr_01h7b3k9rqxn1cw3p9r8t2sgk!")).toEqual({
      ok: false,
      error: "invalid_base32",
    });
  });

  it("cross-brand rejection", () => {
    const org = createTimestampId("org");
    const usr = createTimestampId("usr");
    const orgId = org.generate();
    expect(usr.is(orgId)).toBe(false);
    expect(() => usr.parse(orgId)).toThrow();
  });

  it("brands containing o/i/l", () => {
    const log = createTimestampId("log");
    const logId = log.generate();
    expect(log.is(logId)).toBe(true);
  });

  it("is() does not accept malformed inputs", () => {
    const usr = createTimestampId("usr");
    expect(usr.is(null)).toBe(false);
    expect(usr.is("usr_")).toBe(false);
    expect(usr.is("usr_!!!")).toBe(false);
    expect(usr.is("usr_" + "a".repeat(25))).toBe(false); // wrong length
  });

  it("fails if brand is not exactly three a-z characters", () => {
    for (const brand of ["a", "aaaa", "!@?"]) {
      let err: unknown;
      try {
        createTimestampId(brand);
      } catch (e) {
        err = e;
      }
      expect(isIdsError(err)).toBe(true);
      expect((err as IdsError).code).toBe("invalid_brand");
    }
  });

  it("parse throws IdsError with code invalid_id and ParseError on cause", () => {
    const usr = createTimestampId("usr", { allowDuplicateBrand: true });
    let err: unknown;
    try {
      usr.parse("not-a-usr-id");
    } catch (e) {
      err = e;
    }
    expect(isIdsError(err)).toBe(true);
    expect((err as IdsError).code).toBe("invalid_id");
    expect((err as IdsError).cause).toBe("invalid_prefix");
  });

  it("generate() output matches expected format", () => {
    const usr = createTimestampId("usr");
    const id = usr.generate();
    expect(id).toMatch(/^usr_[0-9a-hjkmnp-tv-z]{25}[048cgmrw]$/);
  });

  it("generate() called many times will always generate distinct values", () => {
    const usr = createTimestampId("usr");
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      const id = usr.generate();
      expect(ids.has(id)).toBe(false);
      ids.add(id);
    }
  });

  it.each([0, 1, 2, 3, 4, 1719000000001, 2 ** 48 - 1])(
    "extractTimestamp() processes the correct bits %d",
    (time) => {
      const usr = createTimestampId("usr", { now: () => time });
      expect(usr.extractTimestamp(usr.generate())).toEqual(new Date(time));
    },
  );

  it.each([0, 1, 0x123456789abc, 2 ** 48 - 1])(
    "minIdForTime() round-trips through extractTimestamp at ms=%d",
    (ms) => {
      const usr = createTimestampId("usr");
      const d = new Date(ms);
      expect(usr.extractTimestamp(usr.minIdForTime(d))).toEqual(d);
    },
  );

  it.each([0, 1, 0x123456789abc, 2 ** 48 - 1])(
    "maxIdForTime() round-trips through extractTimestamp at ms=%d",
    (ms) => {
      const usr = createTimestampId("usr");
      const d = new Date(ms);
      expect(usr.extractTimestamp(usr.maxIdForTime(d))).toEqual(d);
    },
  );

  it("minIdForTime(d) equals a zero-RNG generate() at the same time (tight lower bound)", () => {
    // Equality at the extreme RNG output proves min is the *tight* lower bound,
    // not merely some lower bound. Uses the non-symmetric timestamp from the
    // known-answer test so the cross-boundary base32 char (bits 45–49, where
    // the last 3 timestamp bits meet the first 2 random bits) is exercised.
    const ms = 0x123456789abc;
    const usr = createTimestampId("usr", {
      now: () => ms,
      rng: (target) => target.fill(0x00),
    });
    expect(usr.minIdForTime(new Date(ms))).toBe(usr.generate());
  });

  it("maxIdForTime(d) equals an all-0xFF-RNG generate() at the same time (tight upper bound)", () => {
    const ms = 0x123456789abc;
    const usr = createTimestampId("usr", {
      now: () => ms,
      rng: (target) => target.fill(0xff),
    });
    expect(usr.maxIdForTime(new Date(ms))).toBe(usr.generate());
  });

  it("minIdForTime(d) <= generate() <= maxIdForTime(d) for the default RNG", () => {
    const d = new Date("2026-05-28T12:00:00Z");
    const usr = createTimestampId("usr", { now: () => d.getTime() });
    const min = usr.minIdForTime(d);
    const max = usr.maxIdForTime(d);
    for (let i = 0; i < 100; i++) {
      const id = usr.generate();
      expect(min <= id).toBe(true);
      expect(id <= max).toBe(true);
    }
  });

  it("minIdForTime() rejects pre-epoch dates", () => {
    const usr = createTimestampId("usr");
    expect(() => usr.minIdForTime(new Date(-1))).toThrow();
  });

  it("maxIdForTime() rejects pre-epoch dates", () => {
    const usr = createTimestampId("usr");
    expect(() => usr.maxIdForTime(new Date(-1))).toThrow();
  });

  it("minIdForTime() rejects dates that overflow 48 bits", () => {
    const usr = createTimestampId("usr");
    expect(() => usr.minIdForTime(new Date(2 ** 48))).toThrow();
  });

  it("maxIdForTime() rejects dates that overflow 48 bits", () => {
    const usr = createTimestampId("usr");
    expect(() => usr.maxIdForTime(new Date(2 ** 48))).toThrow();
  });

  it("minIdForTime() rejects an Invalid Date instead of producing an epoch-zero ID", () => {
    const usr = createTimestampId("usr");
    expect(() => usr.minIdForTime(new Date(NaN))).toThrow();
  });

  it("maxIdForTime() rejects an Invalid Date instead of producing an epoch-zero ID", () => {
    const usr = createTimestampId("usr");
    expect(() => usr.maxIdForTime(new Date(NaN))).toThrow();
  });

  it.each([0, 1, 0x123456789abc, 2 ** 48 - 1])(
    "generateAt() round-trips through extractTimestamp at ms=%d",
    (ms) => {
      const usr = createTimestampId("usr");
      const d = new Date(ms);
      expect(usr.extractTimestamp(usr.generateAt(d))).toEqual(d);
    },
  );

  it("generateAt() return type is Id<Brand>", () => {
    const usr = createTimestampId("usr");
    expectTypeOf(usr.generateAt).returns.toEqualTypeOf<Id<"usr">>();
  });

  it("generateAt() produces canonical form (lowercase, no aliases)", () => {
    const usr = createTimestampId("usr");
    const id = usr.generateAt(new Date("2024-03-15T12:00:00Z"));
    expect(id).toMatch(/^usr_[0-9a-hjkmnp-tv-z]{25}[048cgmrw]$/);
    expect(usr.is(id)).toBe(true);
  });

  it("generateAt() fills the random portion from the codec's rng option", () => {
    const date = new Date("2024-03-15T12:00:00Z");
    // A deterministic rng that fills the 10-byte tail with a fixed pattern means
    // generateAt(date) must equal the sentinel built from that same fill.
    const min = createTimestampId("usr", { rng: (target) => target.fill(0x00) });
    const max = createTimestampId("usr", { rng: (target) => target.fill(0xff) });
    expect(min.generateAt(date)).toBe(min.minIdForTime(date));
    expect(max.generateAt(date)).toBe(max.maxIdForTime(date));
  });

  it("generateAt() rejects pre-epoch dates", () => {
    const usr = createTimestampId("usr");
    expect(() => usr.generateAt(new Date(-1))).toThrow();
  });

  it("generateAt() rejects dates that overflow 48 bits", () => {
    const usr = createTimestampId("usr");
    expect(() => usr.generateAt(new Date(2 ** 48))).toThrow();
  });

  it("generateAt() rejects an Invalid Date (NaN timestamp)", () => {
    const usr = createTimestampId("usr");
    expect(() => usr.generateAt(new Date("not a date"))).toThrow();
    expect(() => usr.generateAt(new Date(NaN))).toThrow();
  });

  describe("standard schema adapter", () => {
    it("exposes ~standard with version 1 and vendor '@smonn/ids'", () => {
      const usr = createTimestampId("usr");
      expect(usr["~standard"].version).toBe(1);
      expect(usr["~standard"].vendor).toBe("@smonn/ids");
    });

    it("validate() returns { value: canonical } on lenient success", () => {
      const usr = createTimestampId("usr");
      expect(usr["~standard"].validate("usr_Olh7b3k9rqxnIcw3p9r8t2sgkw")).toEqual({
        value: "usr_01h7b3k9rqxn1cw3p9r8t2sgkw",
      });
    });

    it("validate() reports non-string input with 'expected string'", () => {
      const usr = createTimestampId("usr");
      expect(usr["~standard"].validate(123)).toEqual({
        issues: [{ message: "expected string" }],
      });
    });

    it("validate() reports a wrong prefix with the expected brand prefix", () => {
      const usr = createTimestampId("usr");
      expect(usr["~standard"].validate("org_01h7b3k9rqxn1cw3p9r8t2sgkw")).toEqual({
        issues: [{ message: "expected prefix 'usr_'" }],
      });
    });

    it("validate() reports a malformed payload with 'invalid base32 payload'", () => {
      const usr = createTimestampId("usr");
      expect(usr["~standard"].validate("usr_01h7b3k9rqxn1cw3p9r8t2sgk!")).toEqual({
        issues: [{ message: "invalid base32 payload" }],
      });
    });

    it("~standard.types.output infers Id<Brand> (StandardSchemaV1.InferOutput contract)", () => {
      const usr = createTimestampId("usr");
      type Output = NonNullable<(typeof usr)["~standard"]["types"]>["output"];
      expectTypeOf<Output>().toEqualTypeOf<Id<"usr">>();
    });

    // Hand-written mirror of the Standard Schema v1 interface (kept in the test
    // file so a drift in our TimestampCodec types fails to assign to the spec shape).
    interface StandardSchemaV1Mirror<Input = unknown, Output = Input> {
      readonly "~standard": {
        readonly version: 1;
        readonly vendor: string;
        readonly validate: (
          value: unknown,
          options?: { readonly libraryOptions?: Record<string, unknown> | undefined },
        ) =>
          | { readonly value: Output; readonly issues?: undefined }
          | {
              readonly issues: ReadonlyArray<{
                readonly message: string;
                readonly path?: ReadonlyArray<PropertyKey> | undefined;
              }>;
            }
          | Promise<
              | { readonly value: Output; readonly issues?: undefined }
              | {
                  readonly issues: ReadonlyArray<{
                    readonly message: string;
                    readonly path?: ReadonlyArray<PropertyKey> | undefined;
                  }>;
                }
            >;
        readonly types?: { readonly input: Input; readonly output: Output } | undefined;
      };
    }

    it("TimestampCodec<Brand> structurally satisfies StandardSchemaV1<unknown, Id<Brand>>", () => {
      const usr = createTimestampId("usr");
      const _typecheck: StandardSchemaV1Mirror<unknown, Id<"usr">> = usr;
      expect(_typecheck["~standard"].version).toBe(1);
    });

    it("the three ParseError variants produce three distinct messages", () => {
      const usr = createTimestampId("usr");
      const messages = new Set(
        [123, "org_01h7b3k9rqxn1cw3p9r8t2sgkw", "usr_01h7b3k9rqxn1cw3p9r8t2sgk!"].map((input) => {
          const r = usr["~standard"].validate(input);
          if (!r.issues) throw new Error("expected failure");
          return r.issues[0]!.message;
        }),
      );
      expect(messages.size).toBe(3);
    });
  });

  describe("toJsonSchema (JSON Schema / OpenAPI export)", () => {
    it("returns a string schema with pattern, description, and example", () => {
      const usr = createTimestampId("usr");
      const schema = usr.toJsonSchema();
      expect(schema.type).toBe("string");
      expect(typeof schema.pattern).toBe("string");
      expect(typeof schema.description).toBe("string");
      expect(typeof schema.example).toBe("string");
    });

    it("pattern is anchored at both ends and brand-specific", () => {
      const usr = createTimestampId("usr");
      expect(usr.toJsonSchema().pattern).toBe("^usr_[0-9a-hjkmnp-tv-z]{25}[048cgmrw]$");
    });

    it("description names the brand", () => {
      const usr = createTimestampId("usr");
      expect(usr.toJsonSchema().description).toBe("Branded ID for 'usr'");
    });

    it("every generate() output matches pattern (property test, many iterations)", () => {
      const usr = createTimestampId("usr");
      const re = new RegExp(usr.toJsonSchema().pattern);
      for (let i = 0; i < 1000; i++) {
        expect(re.test(usr.generate())).toBe(true);
      }
    });

    it("example matches the returned pattern", () => {
      const usr = createTimestampId("usr");
      const schema = usr.toJsonSchema();
      expect(new RegExp(schema.pattern).test(schema.example)).toBe(true);
      expect(usr.is(schema.example)).toBe(true);
    });

    it("pattern rejects uppercase and Crockford-alias variants (strict per ADR-0003)", () => {
      const usr = createTimestampId("usr");
      const re = new RegExp(usr.toJsonSchema().pattern);
      expect(re.test("USR_01H7B3K9RQXN1CW3P9R8T2SGKW")).toBe(false); // uppercase
      expect(re.test("usr_Olh7b3k9rqxnIcw3p9r8t2sgkw")).toBe(false); // o/i/l aliases
      expect(re.test("usr_ilo7b3k9rqxn1cw3p9r8t2sgkw")).toBe(false); // i, l, o present
    });

    it("different brands produce different patterns", () => {
      expect(createTimestampId("usr").toJsonSchema().pattern).not.toBe(
        createTimestampId("org").toJsonSchema().pattern,
      );
    });

    it("toJsonSchema() return type is the exported JsonSchema type", () => {
      const usr = createTimestampId("usr");
      expectTypeOf(usr.toJsonSchema()).toEqualTypeOf<JsonSchema>();
    });
  });

  describe("fast-check property tests", () => {
    it("encodeBase32 never throws on arbitrary Uint8Array input", () => {
      fc.assert(
        fc.property(fc.uint8Array(), (bytes) => {
          encodeBase32(bytes);
          return true;
        }),
      );
    });

    it("decodeBase32 never throws on arbitrary string input", () => {
      fc.assert(
        fc.property(fc.string(), (s) => {
          decodeBase32(s);
          return true;
        }),
      );
    });

    it("round-trip: generateAt at arbitrary valid ms yields same timestamp via extractTimestamp", () => {
      const codec = createTimestampId("fck", { allowDuplicateBrand: true });
      fc.assert(
        fc.property(fc.integer({ min: 0, max: 2 ** 48 - 1 }), (ms) => {
          const id = codec.generateAt(new Date(ms));
          return codec.extractTimestamp(id).getTime() === ms;
        }),
      );
    });

    it("safeParse never throws on arbitrary input", () => {
      const codec = createTimestampId("fck", { allowDuplicateBrand: true });
      fc.assert(
        fc.property(fc.string(), (s) => {
          codec.safeParse(s);
          return true;
        }),
      );
    });

    it("safeParse: when ok, returned id satisfies is()", () => {
      const codec = createTimestampId("fck", { allowDuplicateBrand: true });
      fc.assert(
        fc.property(fc.string(), (s) => {
          const r = codec.safeParse(s);
          return !r.ok || codec.is(r.id);
        }),
      );
    });
  });
});

describe("dev-mode duplicate-brand warning", () => {
  // Each test below picks a unique three-letter brand that no other test uses.
  // The duplicate-brand registry is module-level state that persists across
  // tests in the same process; reusing brands would cross-contaminate.
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    vi.unstubAllEnvs();
  });

  it("warns when createTimestampId is called a second time for the same brand", () => {
    createTimestampId("zaa");
    expect(warnSpy).not.toHaveBeenCalled();
    createTimestampId("zaa");
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("does not warn again on a third call for the same brand", () => {
    createTimestampId("zab");
    createTimestampId("zab");
    expect(warnSpy).toHaveBeenCalledTimes(1);
    createTimestampId("zab");
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("does not warn when allowDuplicateBrand is true, even on repeated calls", () => {
    createTimestampId("zac", { allowDuplicateBrand: true });
    createTimestampId("zac", { allowDuplicateBrand: true });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("allowDuplicateBrand: true does not poison the registry for later un-flagged calls", () => {
    createTimestampId("zad", { allowDuplicateBrand: true });
    createTimestampId("zad");
    expect(warnSpy).not.toHaveBeenCalled();
    createTimestampId("zad");
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("TimestampOptions exposes allowDuplicateBrand as an optional boolean", () => {
    expectTypeOf<TimestampOptions["allowDuplicateBrand"]>().toEqualTypeOf<boolean | undefined>();
  });

  it("TimestampOptions accepts reusable objects that omit defaulted injection points", () => {
    const options: TimestampOptions = { allowDuplicateBrand: true };
    const usr = createTimestampId("zag", options);

    expect(usr.generate()).toMatch(/^zag_[0-9a-hjkmnp-tv-z]{25}[048cgmrw]$/);
  });

  it("warning message names the brand and the opt-out flag", () => {
    createTimestampId("zaf");
    createTimestampId("zaf");
    const message = warnSpy.mock.calls[0]?.[0];
    expect(message).toContain('"zaf"');
    expect(message).toContain("allowDuplicateBrand");
  });

  it("in production: no warning is emitted and the registry is not touched", () => {
    vi.stubEnv("NODE_ENV", "production");
    createTimestampId("zae");
    createTimestampId("zae");
    expect(warnSpy).not.toHaveBeenCalled();

    // Lift production gate; the production calls above must not have
    // registered "zae", so the next call should be a fresh first registration.
    vi.unstubAllEnvs();
    createTimestampId("zae");
    expect(warnSpy).not.toHaveBeenCalled();
    createTimestampId("zae");
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});

describe("LayoutOps contract", () => {
  it("LayoutOps<Brand> exampleWireId is (ms?: number) => Id<Brand>", () => {
    expectTypeOf<LayoutOps<"usr">["exampleWireId"]>().toEqualTypeOf<(ms?: number) => Id<"usr">>();
  });

  it("toJsonSchema() example matches the brand pattern", () => {
    const usr = createTimestampId("uzz");
    const schema = usr.toJsonSchema();
    expect(schema.example).toMatch(/^uzz_[0-9a-hjkmnp-tv-z]{25}[048cgmrw]$/);
  });
});

describe("Timestamp codec — UUID methods", () => {
  let warnSilencer: ReturnType<typeof vi.spyOn>;
  beforeAll(() => {
    warnSilencer = vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterAll(() => {
    warnSilencer.mockRestore();
  });

  it("toUUID returns a 36-char lowercase hyphenated UUID", () => {
    const usr = createTimestampId("tuu", { allowDuplicateBrand: true });
    expect(usr.toUUID(usr.generate())).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it("fromUUID(toUUID(id)) === id (round-trip)", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 2 ** 48 - 1 }), (ms) => {
        const usr = createTimestampId("tuu", { allowDuplicateBrand: true });
        const id = usr.generateAt(new Date(ms));
        return usr.fromUUID(usr.toUUID(id)) === id;
      }),
    );
  });

  it("safeFromUUID returns ok:true for a valid UUID and result passes is()", () => {
    const usr = createTimestampId("tuu", { allowDuplicateBrand: true });
    const result = usr.safeFromUUID("01234567-89ab-cdef-0123-456789abcdef");
    expect(result.ok).toBe(true);
    if (result.ok) expect(usr.is(result.id)).toBe(true);
  });

  it("safeFromUUID returns not_string for non-string", () => {
    const usr = createTimestampId("tuu", { allowDuplicateBrand: true });
    expect(usr.safeFromUUID(null)).toEqual({ ok: false, error: "not_string" });
  });

  it("safeFromUUID returns invalid_uuid for malformed UUID", () => {
    const usr = createTimestampId("tuu", { allowDuplicateBrand: true });
    expect(usr.safeFromUUID("bad")).toEqual({ ok: false, error: "invalid_uuid" });
  });

  it("fromUUID throws IdsError invalid_id for bad input", () => {
    const usr = createTimestampId("tuu", { allowDuplicateBrand: true });
    expect(() => usr.fromUUID("bad")).toThrow();
    try {
      usr.fromUUID("bad");
    } catch (e) {
      expect(isIdsError(e)).toBe(true);
      expect((e as IdsError).code).toBe("invalid_id");
      expect((e as IdsError).cause).toBe("invalid_uuid");
    }
  });
});
