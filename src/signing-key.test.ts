import { describe, expect, expectTypeOf, it } from "vitest";
import {
  decodeSigningKey,
  encodeSigningKey,
  getSigningKeyHmacKey,
  importSigningKey,
  signingKeysEqual,
  type SigningKey,
  type SigningKeyFormat,
} from "./signing-key.js";
import { importWrappingKey, getWrappingKeyMaterial } from "./wrapping-key.js";
import { importOpaqueKey, getOpaqueKeyCryptoKey } from "./opaque-key.js";
import { isIdsError, type IdsErrorCode } from "./error.js";

const bytes16 = new Uint8Array(16).map((_, i) => i);
const bytes24 = new Uint8Array(24).map((_, i) => i);
const bytes32 = new Uint8Array(32).map((_, i) => i * 2);

function throwsIdsError(fn: () => unknown, code: IdsErrorCode): void {
  let thrown: unknown;
  try {
    fn();
  } catch (e) {
    thrown = e;
  }
  expect(isIdsError(thrown), `expected IdsError(${code}), got ${thrown}`).toBe(true);
  if (isIdsError(thrown)) expect(thrown.code).toBe(code);
}

async function rejectsWithIdsError(promise: Promise<unknown>, code: IdsErrorCode): Promise<void> {
  let thrown: unknown;
  try {
    await promise;
  } catch (e) {
    thrown = e;
  }
  expect(isIdsError(thrown), `expected IdsError(${code}), got ${thrown}`).toBe(true);
  if (isIdsError(thrown)) expect(thrown.code).toBe(code);
}

describe("importSigningKey", () => {
  it("returns an opaque SigningKey handle from 16-byte material", async () => {
    const key = await importSigningKey(bytes16);
    expect(key).toBeDefined();
    expect(typeof key).toBe("object");
  });

  it("returns an opaque SigningKey handle from 24-byte material", async () => {
    const key = await importSigningKey(bytes24);
    expect(key).toBeDefined();
  });

  it("returns an opaque SigningKey handle from 32-byte material", async () => {
    const key = await importSigningKey(bytes32);
    expect(key).toBeDefined();
  });

  it("does not expose the underlying CryptoKey directly", async () => {
    const key = await importSigningKey(bytes16);
    expect(key).not.toHaveProperty("type");
    expect(key).not.toHaveProperty("algorithm");
    expect(key).not.toHaveProperty("extractable");
    expect(key).not.toHaveProperty("usages");
  });

  it("returns type Promise<SigningKey>", () => {
    expectTypeOf(importSigningKey).returns.toEqualTypeOf<Promise<SigningKey>>();
  });

  it("throws IdsError invalid_key_length for 8-byte input", async () => {
    await rejectsWithIdsError(importSigningKey(new Uint8Array(8)), "invalid_key_length");
  });

  it("throws IdsError invalid_key_length for 31-byte input", async () => {
    await rejectsWithIdsError(importSigningKey(new Uint8Array(31)), "invalid_key_length");
  });

  it("throws IdsError invalid_key_length for 0-byte input", async () => {
    await rejectsWithIdsError(importSigningKey(new Uint8Array(0)), "invalid_key_length");
  });
});

describe("encodeSigningKey / decodeSigningKey", () => {
  it.each([
    ["hex", "000102030405060708090a0b0c0d0e0f"],
    ["base64url", "AAECAwQFBgcICQoLDA0ODw"],
  ] as const)("round-trips 128-bit key as %s", (format, encoded) => {
    expect(encodeSigningKey(bytes16, format)).toBe(encoded);
    expect(decodeSigningKey(encoded, format)).toEqual(bytes16);
  });

  it("round-trips 256-bit key as hex", () => {
    const encoded = encodeSigningKey(bytes32, "hex");
    expect(encoded).toHaveLength(64);
    expect(decodeSigningKey(encoded, "hex")).toEqual(bytes32);
  });

  it("round-trips 192-bit key as base64url", () => {
    const encoded = encodeSigningKey(bytes24, "base64url");
    expect(decodeSigningKey(encoded, "base64url")).toEqual(bytes24);
  });

  it("SigningKeyFormat type is 'hex' | 'base64url'", () => {
    expectTypeOf<SigningKeyFormat>().toEqualTypeOf<"hex" | "base64url">();
  });

  it("encodeSigningKey throws IdsError invalid_key_format for unknown format", () => {
    throwsIdsError(() => encodeSigningKey(bytes16, "bogus" as never), "invalid_key_format");
  });

  it("decodeSigningKey throws IdsError invalid_key_format for unknown format", () => {
    throwsIdsError(() => decodeSigningKey("aabbccdd", "bogus" as never), "invalid_key_format");
  });

  it("encodeSigningKey throws IdsError invalid_key_length for wrong byte count", () => {
    throwsIdsError(() => encodeSigningKey(new Uint8Array(8), "hex"), "invalid_key_length");
  });

  it("decodeSigningKey throws IdsError invalid_key_encoding for odd-length hex", () => {
    throwsIdsError(() => decodeSigningKey("abc", "hex"), "invalid_key_encoding");
  });

  it("decodeSigningKey throws IdsError invalid_key_encoding for non-hex characters", () => {
    throwsIdsError(() => decodeSigningKey("gg", "hex"), "invalid_key_encoding");
  });

  it("decodeSigningKey throws IdsError invalid_key_encoding for invalid base64url", () => {
    throwsIdsError(() => decodeSigningKey("!!!", "base64url"), "invalid_key_encoding");
  });

  it("decodeSigningKey throws IdsError invalid_key_length when decoded bytes are wrong length", () => {
    throwsIdsError(() => decodeSigningKey("aabbcc", "hex"), "invalid_key_length");
  });

  it("encodeSigningKey throws IdsError invalid_key_format for non-coercible format value", () => {
    throwsIdsError(
      () => encodeSigningKey(bytes16, Object.create(null) as never),
      "invalid_key_format",
    );
  });
});

describe("HKDF domain separation", () => {
  it("same raw bytes as SigningKey and WrappingKey produce different HMAC outputs", async () => {
    const rawBytes = new Uint8Array(32).fill(0xab);

    const signingKey = await importSigningKey(rawBytes);
    const wrappingKey = await importWrappingKey(rawBytes);

    const signingHmacKey = getSigningKeyHmacKey(signingKey);
    const wrappingHmacKey = getWrappingKeyMaterial(wrappingKey).hmacKey;

    const testData = new TextEncoder().encode("test-domain-separation");

    const sigSig = await crypto.subtle.sign("HMAC", signingHmacKey, testData);
    const wrapSig = await crypto.subtle.sign("HMAC", wrappingHmacKey, testData);

    expect(new Uint8Array(sigSig)).not.toEqual(new Uint8Array(wrapSig));
  });

  it("same raw bytes as SigningKey and OpaqueKey yield different algorithm keys", async () => {
    const rawBytes = new Uint8Array(32).fill(0xef);

    const signingKey = await importSigningKey(rawBytes);
    const opaqueKey = await importOpaqueKey(rawBytes);

    const signingHmacKey = getSigningKeyHmacKey(signingKey);
    const opaqueCryptoKey = getOpaqueKeyCryptoKey(opaqueKey);

    expect(signingHmacKey.algorithm.name).toBe("HMAC");
    expect(opaqueCryptoKey.algorithm.name).toBe("AES-CBC");
  });

  it("two different SigningKey imports of the same bytes produce the same HMAC output", async () => {
    const rawBytes = new Uint8Array(32).fill(0xcd);

    const key1 = await importSigningKey(rawBytes);
    const key2 = await importSigningKey(rawBytes);

    const testData = new TextEncoder().encode("consistency-check");
    const sig1 = await crypto.subtle.sign("HMAC", getSigningKeyHmacKey(key1), testData);
    const sig2 = await crypto.subtle.sign("HMAC", getSigningKeyHmacKey(key2), testData);

    expect(new Uint8Array(sig1)).toEqual(new Uint8Array(sig2));
  });
});

describe("signingKeysEqual", () => {
  it("returns true for two handles from the same raw bytes", async () => {
    const a = await importSigningKey(bytes16);
    const b = await importSigningKey(bytes16);
    expect(signingKeysEqual(a, b)).toBe(true);
  });

  it("returns false for handles from different raw bytes (different length)", async () => {
    const a = await importSigningKey(bytes16);
    const b = await importSigningKey(bytes32);
    expect(signingKeysEqual(a, b)).toBe(false);
  });

  it("returns false for handles from same-length but different raw bytes", async () => {
    const a = await importSigningKey(new Uint8Array(16).fill(0xaa));
    const b = await importSigningKey(new Uint8Array(16).fill(0xbb));
    expect(signingKeysEqual(a, b)).toBe(false);
  });
});

describe("keyring validation", () => {
  it("keys[0] is treated as current (first in array)", async () => {
    const key1 = await importSigningKey(bytes16);
    const key2 = await importSigningKey(bytes32);
    const keyring: [SigningKey, ...SigningKey[]] = [key1, key2];
    expect(keyring[0]).toBe(key1);
  });
});

describe("getSigningKeyHmacKey", () => {
  it("returns a CryptoKey usable for HMAC sign/verify", async () => {
    const key = await importSigningKey(bytes16);
    const hmacKey = getSigningKeyHmacKey(key);
    expect(hmacKey).toHaveProperty("type");
    expect(hmacKey.algorithm).toMatchObject({ name: "HMAC" });
  });

  it("throws for an unregistered handle", () => {
    const fake = Object.freeze({}) as SigningKey;
    expect(() => getSigningKeyHmacKey(fake)).toThrow(Error);
  });
});
