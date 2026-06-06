import { describe, expect, it } from "vitest";
import { decodeOpaqueKey, encodeOpaqueKey } from "./opaque-key.js";

describe("opaque-key", () => {
  const bytes16 = new Uint8Array(16).map((_, i) => i);
  const bytes32 = new Uint8Array(32).map((_, i) => i * 2);

  it.each([
    ["hex", "000102030405060708090a0b0c0d0e0f"],
    ["base64url", "AAECAwQFBgcICQoLDA0ODw"],
  ] as const)("round-trips 128-bit key as %s", (format, encoded) => {
    expect(encodeOpaqueKey(bytes16, format)).toBe(encoded);
    expect(decodeOpaqueKey(encoded, format)).toEqual(bytes16);
  });

  it("round-trips 256-bit key as hex", () => {
    const encoded = encodeOpaqueKey(bytes32, "hex");
    expect(encoded).toHaveLength(64);
    expect(decodeOpaqueKey(encoded, "hex")).toEqual(bytes32);
  });

  it("rejects invalid hex length", () => {
    expect(() => decodeOpaqueKey("abc", "hex")).toThrow(/even number/);
  });

  it("rejects invalid hex characters", () => {
    expect(() => decodeOpaqueKey("gg", "hex")).toThrow(/\[0-9a-fA-F\]/);
  });

  it("rejects invalid AES key byte length", () => {
    expect(() => decodeOpaqueKey("aabbcc", "hex")).toThrow(/16, 24, or 32 bytes/);
    expect(() => encodeOpaqueKey(new Uint8Array(8), "hex")).toThrow(/16, 24, or 32 bytes/);
  });

  it("rejects invalid base64url key material", () => {
    expect(() => decodeOpaqueKey("!!!", "base64url")).toThrow(/invalid base64url key/);
  });
});
