import { describe, expect, it } from "vitest";
import { decodeBase64Url, decodeHex, encodeBase64Url, encodeHex } from "./bytes.js";

describe("bytes", () => {
  const sample = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);

  it("round-trips hex", () => {
    expect(encodeHex(sample)).toBe("000102030405060708090a0b0c0d0e0f");
    expect(decodeHex("000102030405060708090a0b0c0d0e0f")).toEqual(sample);
    expect(decodeHex("000102030405060708090A0B0C0D0E0F")).toEqual(sample);
  });

  it("round-trips base64url", () => {
    expect(encodeBase64Url(sample)).toBe("AAECAwQFBgcICQoLDA0ODw");
    expect(decodeBase64Url("AAECAwQFBgcICQoLDA0ODw")).toEqual(sample);
  });

  it("decodeHex throws on invalid characters", () => {
    expect(() => decodeHex("gg")).toThrow(/invalid hex/);
  });

  it("decodeHex throws on odd-length input", () => {
    expect(() => decodeHex("abc")).toThrow(/invalid hex/);
  });

  it("decodeHex throws when a character code is out of range", () => {
    expect(() => decodeHex("\u0080\u0080")).toThrow(/invalid hex/);
  });

  it("decodeBase64Url throws on invalid input", () => {
    expect(() => decodeBase64Url("!!!")).toThrow();
  });
});
