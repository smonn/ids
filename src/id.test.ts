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

  it("validation accepts case + aliases", () => {
    const usr = createId("usr");
    expect(usr.is("USR_01H7B3K9rqxn4cw3p9r8t2sgkz")).toBe(true);
    expect(usr.is("usr_O1h7b3k9rqxnIcw3p9r8t2sgkz")).toBe(true); // O→0, I→1
  });

  it("parse does not throw when valid", () => {
    const usr = createId("usr");
    expect(usr.parse("usr_Olh7b3k9rqxnIcw3p9r8t2sgkz")).toEqual("usr_01h7b3k9rqxn1cw3p9r8t2sgkz");
  });

  it("safeParse does not throw", () => {
    const usr = createId("usr");
    expect(usr.safeParse("usr_Olh7b3k9rqxnIcw3p9r8t2sgkz")).toEqual({
      success: true,
      data: "usr_01h7b3k9rqxn1cw3p9r8t2sgkz",
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

  it("malformed inputs", () => {
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
