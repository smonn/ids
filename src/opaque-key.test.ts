import { describe, expect, expectTypeOf, it } from "vitest";
import { IdsError, isIdsError } from "./error.js";
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
    let err: unknown;
    try {
      decodeOpaqueKey("abc", "hex");
    } catch (e) {
      err = e;
    }
    expect(isIdsError(err)).toBe(true);
    expect((err as IdsError).code).toBe("invalid_key_format");
  });

  it("rejects invalid hex characters", () => {
    let err: unknown;
    try {
      decodeOpaqueKey("gg", "hex");
    } catch (e) {
      err = e;
    }
    expect(isIdsError(err)).toBe(true);
    expect((err as IdsError).code).toBe("invalid_key_encoding");
  });

  it("rejects invalid AES key byte length", () => {
    let err: unknown;
    try {
      decodeOpaqueKey("aabbcc", "hex");
    } catch (e) {
      err = e;
    }
    expect(isIdsError(err)).toBe(true);
    expect((err as IdsError).code).toBe("invalid_key_length");

    err = undefined;
    try {
      encodeOpaqueKey(new Uint8Array(8), "hex");
    } catch (e) {
      err = e;
    }
    expect(isIdsError(err)).toBe(true);
    expect((err as IdsError).code).toBe("invalid_key_length");
  });

  it("rejects invalid opaque key format when encoding", () => {
    let err: unknown;
    try {
      encodeOpaqueKey(bytes16, "bogus" as never);
    } catch (e) {
      err = e;
    }
    expect(isIdsError(err)).toBe(true);
    expect((err as IdsError).code).toBe("invalid_key_format");
  });

  it("rejects invalid opaque key format when decoding", () => {
    let err: unknown;
    try {
      decodeOpaqueKey("AAECAwQFBgcICQoLDA0ODw", "bogus" as never);
    } catch (e) {
      err = e;
    }
    expect(isIdsError(err)).toBe(true);
    expect((err as IdsError).code).toBe("invalid_key_format");
  });

  it("rejects non-string opaque key format values", () => {
    let err: unknown;
    try {
      encodeOpaqueKey(bytes16, undefined as never);
    } catch (e) {
      err = e;
    }
    expect(isIdsError(err)).toBe(true);
    expect((err as IdsError).code).toBe("invalid_key_format");

    err = undefined;
    try {
      decodeOpaqueKey("AAECAwQFBgcICQoLDA0ODw", undefined as never);
    } catch (e) {
      err = e;
    }
    expect(isIdsError(err)).toBe(true);
    expect((err as IdsError).code).toBe("invalid_key_format");
  });

  it("rejects non-coercible opaque key format values with a clear error", () => {
    const format = Object.create(null) as never;
    let err: unknown;
    try {
      encodeOpaqueKey(bytes16, format);
    } catch (e) {
      err = e;
    }
    expect(isIdsError(err)).toBe(true);
    expect((err as IdsError).code).toBe("invalid_key_format");

    err = undefined;
    try {
      decodeOpaqueKey("AAECAwQFBgcICQoLDA0ODw", format);
    } catch (e) {
      err = e;
    }
    expect(isIdsError(err)).toBe(true);
    expect((err as IdsError).code).toBe("invalid_key_format");
  });

  it("rejects invalid base64url key material", () => {
    let err: unknown;
    try {
      decodeOpaqueKey("!!!", "base64url");
    } catch (e) {
      err = e;
    }
    expect(isIdsError(err)).toBe(true);
    expect((err as IdsError).code).toBe("invalid_key_encoding");
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
    await expect(importOpaqueKey(new Uint8Array(8))).rejects.toMatchObject({
      code: "invalid_key_length",
    });
    await expect(importOpaqueKey(new Uint8Array(31))).rejects.toMatchObject({
      code: "invalid_key_length",
    });
  });

  it("getOpaqueKeyCryptoKey throws on an unregistered handle (internal guard — plain Error)", () => {
    const fake = Object.freeze({}) as OpaqueKey;
    let err: unknown;
    try {
      getOpaqueKeyCryptoKey(fake);
    } catch (e) {
      err = e;
    }
    // WeakMap handle-not-found is an internal invariant — stays plain Error, not IdsError
    expect(err instanceof Error).toBe(true);
    expect(isIdsError(err)).toBe(false);
    expect((err as Error).message).toMatch("invalid opaque key");
  });
});
