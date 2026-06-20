import { describe, expect, expectTypeOf, it } from "vitest";
import {
  decodeOpaqueKey,
  encodeOpaqueKey,
  getOpaqueKeyCryptoKey,
  importOpaqueKey,
  type OpaqueKey,
} from "./opaque-key.js";

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

  it("rejects invalid opaque key format when encoding", () => {
    expect(() => encodeOpaqueKey(bytes16, "bogus" as never)).toThrow(
      "invalid opaque key format: expected hex or base64url, got 'bogus'",
    );
  });

  it("rejects invalid opaque key format when decoding", () => {
    expect(() => decodeOpaqueKey("AAECAwQFBgcICQoLDA0ODw", "bogus" as never)).toThrow(
      "invalid opaque key format: expected hex or base64url, got 'bogus'",
    );
  });

  it("rejects non-string opaque key format values", () => {
    expect(() => encodeOpaqueKey(bytes16, undefined as never)).toThrow(
      "invalid opaque key format: expected hex or base64url, got 'undefined'",
    );
    expect(() => decodeOpaqueKey("AAECAwQFBgcICQoLDA0ODw", undefined as never)).toThrow(
      "invalid opaque key format: expected hex or base64url, got 'undefined'",
    );
  });

  it("rejects non-coercible opaque key format values with a clear error", () => {
    const format = Object.create(null) as never;

    expect(() => encodeOpaqueKey(bytes16, format)).toThrow(
      "invalid opaque key format: expected hex or base64url, got '[unprintable]'",
    );
    expect(() => decodeOpaqueKey("AAECAwQFBgcICQoLDA0ODw", format)).toThrow(
      "invalid opaque key format: expected hex or base64url, got '[unprintable]'",
    );
  });

  it("rejects invalid base64url key material", () => {
    expect(() => decodeOpaqueKey("!!!", "base64url")).toThrow(/invalid base64url key/);
  });
});

describe("importOpaqueKey", () => {
  it("is exported from opaque-key module", () => {
    expect(typeof importOpaqueKey).toBe("function");
  });

  it("returns an OpaqueKey handle, not a raw CryptoKey", async () => {
    const key = await importOpaqueKey(new Uint8Array(16));
    // A raw CryptoKey exposes .type, .algorithm, .extractable, .usages
    expect(key).not.toHaveProperty("type");
    expect(key).not.toHaveProperty("algorithm");
    expect(key).not.toHaveProperty("extractable");
    expect(key).not.toHaveProperty("usages");
  });

  it("importOpaqueKey return type is Promise<OpaqueKey>", () => {
    expectTypeOf(importOpaqueKey).returns.toEqualTypeOf<Promise<OpaqueKey>>();
  });

  it("rejects invalid key byte lengths", async () => {
    await expect(importOpaqueKey(new Uint8Array(8))).rejects.toThrow(/16, 24, or 32 bytes/);
    await expect(importOpaqueKey(new Uint8Array(31))).rejects.toThrow(/16, 24, or 32 bytes/);
  });

  it("getOpaqueKeyCryptoKey throws on an unregistered handle", () => {
    const fake = Object.freeze({}) as OpaqueKey;
    expect(() => getOpaqueKeyCryptoKey(fake)).toThrow("invalid opaque key");
  });
});
