import { expect, describe, it } from "vitest";
import { createId, type Id } from "./id.js";

describe("id", () => {
  it("roundtrip", () => {
    const fixed = new Date("2026-05-28T12:00:00Z");
    const usr = createId("usr", { now: () => fixed.getTime() });
    const id = usr.generate();
    expect(usr.extractTimestamp(id)).toEqual(fixed);
  });

  it("deterministic snapshot", () => {
    const usr = createId("usr", {
      now: () => 0,
      rng: () => {},
    });
    expect(usr.generate()).toBe("usr_" + "0".repeat(26)); // adjust to actual
  });

  it("non-symmetric known-answer encoding", () => {
    // Buffer: timestamp 0x123456789abc, 9 zero random bytes, last byte 0xff.
    // Non-zero last byte exercises the tail-emit shift; non-symmetric timestamp
    // exercises the main loop across every 5-bit alignment.
    const usr = createId("usr", {
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
    const usr = createId("usr");
    const id = "usr_28t5cy4tqg00000000000000zw" as Id<"usr">;
    expect(usr.extractTimestamp(id)).toEqual(new Date(0x123456789abc));
  });

  it("extracts ms=0 (epoch boundary)", () => {
    const usr = createId("usr", {
      now: () => 0,
      rng: () => {},
    });
    expect(usr.extractTimestamp(usr.generate())).toEqual(new Date(0));
  });

  it("extracts ms at the 48-bit boundary", () => {
    const maxMs = 2 ** 48 - 1;
    const usr = createId("usr", {
      now: () => maxMs,
      rng: () => {},
    });
    expect(usr.extractTimestamp(usr.generate())).toEqual(new Date(maxMs));
  });

  it("rejects timestamps that overflow 48 bits", () => {
    const usr = createId("usr", {
      now: () => 2 ** 48,
      rng: () => {},
    });
    expect(() => usr.generate()).toThrow();
  });

  it("rejects pre-epoch timestamps", () => {
    const usr = createId("usr", {
      now: () => -1,
      rng: () => {},
    });
    expect(() => usr.generate()).toThrow();
  });

  it("handles maximal random bytes", () => {
    const usr = createId("usr", {
      now: () => 0,
      rng: (target) => target.fill(0xff),
    });
    const id = usr.generate();
    expect(usr.is(id)).toBe(true);
    expect(usr.extractTimestamp(id)).toEqual(new Date(0));
  });

  it("is() accepts only canonical form", () => {
    const usr = createId("usr");
    expect(usr.is("usr_01h7b3k9rqxn1cw3p9r8t2sgkz")).toBe(true);
    expect(usr.is("USR_01H7B3K9RQXN1CW3P9R8T2SGKZ")).toBe(false); // uppercase
    expect(usr.is("usr_Olh7b3k9rqxnIcw3p9r8t2sgkz")).toBe(false); // contains o/i/l aliases
  });

  it("parse() normalises lenient input to canonical form", () => {
    const usr = createId("usr");
    expect(usr.parse("USR_01H7B3K9rqxn4cw3p9r8t2sgkz")).toEqual("usr_01h7b3k9rqxn4cw3p9r8t2sgkz");
    expect(usr.parse("usr_Olh7b3k9rqxnIcw3p9r8t2sgkz")).toEqual("usr_01h7b3k9rqxn1cw3p9r8t2sgkz");
  });

  it("safeParse() returns canonical form on success", () => {
    const usr = createId("usr");
    expect(usr.safeParse("usr_Olh7b3k9rqxnIcw3p9r8t2sgkz")).toEqual({
      ok: true,
      id: "usr_01h7b3k9rqxn1cw3p9r8t2sgkz",
    });
  });

  it("safeParse() canonicalises an all-alias base32 portion", () => {
    const usr = createId("usr");
    expect(usr.safeParse("usr_" + "i".repeat(26))).toEqual({
      ok: true,
      id: "usr_" + "1".repeat(26),
    });
  });

  it("safeParse() fails on bad input", () => {
    const usr = createId("usr");
    expect(usr.safeParse(null)).toEqual({ ok: false, error: "not_string" });
    expect(usr.safeParse("org_Olh7b3k9rqxnIcw3p9r8t2sgkz")).toEqual({
      ok: false,
      error: "invalid_prefix",
    });
    expect(usr.safeParse("usr_01h7b3k9rqxn1cw3p9r8t2sgk!")).toEqual({
      ok: false,
      error: "invalid_base32",
    });
  });

  it("cross-brand rejection", () => {
    const org = createId("org");
    const usr = createId("usr");
    const orgId = org.generate();
    expect(usr.is(orgId)).toBe(false);
    expect(() => usr.parse(orgId)).toThrow();
  });

  it("brands containing o/i/l", () => {
    const log = createId("log");
    const logId = log.generate();
    expect(log.is(logId)).toBe(true);
  });

  it("is() does not accept malformed inputs", () => {
    const usr = createId("usr");
    expect(usr.is(null)).toBe(false);
    expect(usr.is("usr_")).toBe(false);
    expect(usr.is("usr_!!!")).toBe(false);
    expect(usr.is("usr_" + "a".repeat(25))).toBe(false); // wrong length
  });

  it("fails if brand is not exactly three a-z characters", () => {
    expect(() => createId("a")).toThrow();
    expect(() => createId("aaaa")).toThrow();
    expect(() => createId("!@?")).toThrow();
  });

  it("generate() output matches expected format", () => {
    const usr = createId("usr");
    const id = usr.generate();
    expect(id).toMatch(/^usr_[0-9a-hjkmnp-tv-z]{26}$/);
  });

  it("generate() called many times will always generate distinct values", () => {
    const usr = createId("usr");
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
      const usr = createId("usr", { now: () => time });
      expect(usr.extractTimestamp(usr.generate())).toEqual(new Date(time));
    },
  );

  it.each([0, 1, 0x123456789abc, 2 ** 48 - 1])(
    "minIdForTime() round-trips through extractTimestamp at ms=%d",
    (ms) => {
      const usr = createId("usr");
      const d = new Date(ms);
      expect(usr.extractTimestamp(usr.minIdForTime(d))).toEqual(d);
    },
  );

  it.each([0, 1, 0x123456789abc, 2 ** 48 - 1])(
    "maxIdForTime() round-trips through extractTimestamp at ms=%d",
    (ms) => {
      const usr = createId("usr");
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
    const usr = createId("usr", {
      now: () => ms,
      rng: (target) => target.fill(0x00),
    });
    expect(usr.minIdForTime(new Date(ms))).toBe(usr.generate());
  });

  it("maxIdForTime(d) equals an all-0xFF-RNG generate() at the same time (tight upper bound)", () => {
    const ms = 0x123456789abc;
    const usr = createId("usr", {
      now: () => ms,
      rng: (target) => target.fill(0xff),
    });
    expect(usr.maxIdForTime(new Date(ms))).toBe(usr.generate());
  });

  it("minIdForTime(d) <= generate() <= maxIdForTime(d) for the default RNG", () => {
    const d = new Date("2026-05-28T12:00:00Z");
    const usr = createId("usr", { now: () => d.getTime() });
    const min = usr.minIdForTime(d);
    const max = usr.maxIdForTime(d);
    for (let i = 0; i < 100; i++) {
      const id = usr.generate();
      expect(min <= id).toBe(true);
      expect(id <= max).toBe(true);
    }
  });

  it("minIdForTime() rejects pre-epoch dates with the same message as generate()", () => {
    const usr = createId("usr");
    expect(() => usr.minIdForTime(new Date(-1))).toThrow("timestamp is negative");
  });

  it("maxIdForTime() rejects pre-epoch dates with the same message as generate()", () => {
    const usr = createId("usr");
    expect(() => usr.maxIdForTime(new Date(-1))).toThrow("timestamp is negative");
  });

  it("minIdForTime() rejects dates that overflow 48 bits with the same message as generate()", () => {
    const usr = createId("usr");
    expect(() => usr.minIdForTime(new Date(2 ** 48))).toThrow("timestamp exceeds 48-bit range");
  });

  it("maxIdForTime() rejects dates that overflow 48 bits with the same message as generate()", () => {
    const usr = createId("usr");
    expect(() => usr.maxIdForTime(new Date(2 ** 48))).toThrow("timestamp exceeds 48-bit range");
  });
});
