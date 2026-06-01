import { expect, describe, it } from "vitest";
import { createId } from "./id.js";

describe("id", () => {
  it("roundtrip", () => {
    const fixed = new Date("2026-05-28T12:00:00Z");
    const usr = createId("usr", { now: () => fixed });
    const id = usr.generate();
    expect(usr.extractTimestamp(id)).toEqual(fixed);
  });

  it("deterministic snapshot", () => {
    const usr = createId("usr", {
      now: () => new Date(0),
      rng: (n) => new Uint8Array(n),
    });
    expect(usr.generate()).toBe("usr_" + "0".repeat(26)); // adjust to actual
  });

  it("extracts ms=0 (epoch boundary)", () => {
    const usr = createId("usr", {
      now: () => new Date(0),
      rng: (n) => new Uint8Array(n),
    });
    expect(usr.extractTimestamp(usr.generate())).toEqual(new Date(0));
  });

  it("extracts ms at the 48-bit boundary", () => {
    const maxMs = 2 ** 48 - 1;
    const usr = createId("usr", {
      now: () => new Date(maxMs),
      rng: (n) => new Uint8Array(n),
    });
    expect(usr.extractTimestamp(usr.generate())).toEqual(new Date(maxMs));
  });

  it("rejects timestamps that overflow 48 bits", () => {
    const usr = createId("usr", {
      now: () => new Date(2 ** 48),
      rng: (n) => new Uint8Array(n),
    });
    expect(() => usr.generate()).toThrow();
  });

  it("rejects pre-epoch timestamps", () => {
    const usr = createId("usr", {
      now: () => new Date(-1),
      rng: (n) => new Uint8Array(n),
    });
    expect(() => usr.generate()).toThrow();
  });

  it("handles maximal random bytes", () => {
    const usr = createId("usr", {
      now: () => new Date(0),
      rng: (n) => new Uint8Array(n).fill(0xff),
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
});
