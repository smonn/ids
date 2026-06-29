import { describe, expect, expectTypeOf, it } from "vitest";
import {
  decodeWrappingKey,
  encodeWrappingKey,
  getWrappingKeyMaterial,
  importWrappingKey,
  wrappingKeysEqual,
  type WrappingKey,
  type WrappingKeyFormat,
} from "./key.js";
import { importSigningKey, getSigningKeyHmacKey } from "../signed/key.js";
import { importDigestKey, getDigestKeyHmacKey } from "../digest/key.js";
import { isIdsError, type IdsErrorCode } from "../../error.js";

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

describe("importWrappingKey", () => {
  it("returns an opaque WrappingKey handle from 16-byte material", async () => {
    const key = await importWrappingKey(bytes16);
    expect(key).toBeDefined();
    expect(typeof key).toBe("object");
  });

  it("returns an opaque WrappingKey handle from 24-byte material", async () => {
    const key = await importWrappingKey(bytes24);
    expect(key).toBeDefined();
  });

  it("returns an opaque WrappingKey handle from 32-byte material", async () => {
    const key = await importWrappingKey(bytes32);
    expect(key).toBeDefined();
  });

  it("does not expose the underlying CryptoKey directly", async () => {
    const key = await importWrappingKey(bytes16);
    expect(key).not.toHaveProperty("type");
    expect(key).not.toHaveProperty("algorithm");
    expect(key).not.toHaveProperty("extractable");
    expect(key).not.toHaveProperty("usages");
  });

  it("returns type Promise<WrappingKey>", () => {
    expectTypeOf(importWrappingKey).returns.toEqualTypeOf<Promise<WrappingKey>>();
  });

  it("throws IdsError invalid_key_length for 8-byte input", async () => {
    await rejectsWithIdsError(importWrappingKey(new Uint8Array(8)), "invalid_key_length");
  });

  it("throws IdsError invalid_key_length for 31-byte input", async () => {
    await rejectsWithIdsError(importWrappingKey(new Uint8Array(31)), "invalid_key_length");
  });

  it("throws IdsError invalid_key_length for 0-byte input", async () => {
    await rejectsWithIdsError(importWrappingKey(new Uint8Array(0)), "invalid_key_length");
  });
});

describe("encodeWrappingKey / decodeWrappingKey", () => {
  it.each([
    ["hex", "000102030405060708090a0b0c0d0e0f"],
    ["base64url", "AAECAwQFBgcICQoLDA0ODw"],
  ] as const)("round-trips 128-bit key as %s", (format, encoded) => {
    expect(encodeWrappingKey(bytes16, format)).toBe(encoded);
    expect(decodeWrappingKey(encoded, format)).toEqual(bytes16);
  });

  it("round-trips 256-bit key as hex", () => {
    const encoded = encodeWrappingKey(bytes32, "hex");
    expect(encoded).toHaveLength(64);
    expect(decodeWrappingKey(encoded, "hex")).toEqual(bytes32);
  });

  it("round-trips 192-bit key as base64url", () => {
    const encoded = encodeWrappingKey(bytes24, "base64url");
    expect(decodeWrappingKey(encoded, "base64url")).toEqual(bytes24);
  });

  it("WrappingKeyFormat type is 'hex' | 'base64url'", () => {
    expectTypeOf<WrappingKeyFormat>().toEqualTypeOf<"hex" | "base64url">();
  });

  it("encodeWrappingKey throws IdsError invalid_key_format for unknown format", () => {
    throwsIdsError(() => encodeWrappingKey(bytes16, "bogus" as never), "invalid_key_format");
  });

  it("decodeWrappingKey throws IdsError invalid_key_format for unknown format", () => {
    throwsIdsError(() => decodeWrappingKey("aabbccdd", "bogus" as never), "invalid_key_format");
  });

  it("encodeWrappingKey throws IdsError invalid_key_length for wrong byte count", () => {
    throwsIdsError(() => encodeWrappingKey(new Uint8Array(8), "hex"), "invalid_key_length");
  });

  it("decodeWrappingKey throws IdsError invalid_key_encoding for odd-length hex", () => {
    throwsIdsError(() => decodeWrappingKey("abc", "hex"), "invalid_key_encoding");
  });

  it("decodeWrappingKey throws IdsError invalid_key_encoding for non-hex characters", () => {
    throwsIdsError(() => decodeWrappingKey("gg", "hex"), "invalid_key_encoding");
  });

  it("decodeWrappingKey throws IdsError invalid_key_encoding for invalid base64url", () => {
    throwsIdsError(() => decodeWrappingKey("!!!", "base64url"), "invalid_key_encoding");
  });

  it("decodeWrappingKey throws IdsError invalid_key_length when decoded bytes are wrong length", () => {
    throwsIdsError(() => decodeWrappingKey("aabbcc", "hex"), "invalid_key_length");
  });

  it("encodeWrappingKey throws IdsError invalid_key_format for non-coercible format value", () => {
    throwsIdsError(
      () => encodeWrappingKey(bytes16, Object.create(null) as never),
      "invalid_key_format",
    );
  });
});

describe("wrappingKeysEqual", () => {
  it("returns true for two handles from the same raw bytes", async () => {
    const a = await importWrappingKey(bytes16);
    const b = await importWrappingKey(bytes16);
    expect(wrappingKeysEqual(a, b)).toBe(true);
  });

  it("returns false for handles from different raw bytes (different length)", async () => {
    const a = await importWrappingKey(bytes16);
    const b = await importWrappingKey(bytes32);
    expect(wrappingKeysEqual(a, b)).toBe(false);
  });

  it("returns false for handles from same-length but different raw bytes", async () => {
    const a = await importWrappingKey(new Uint8Array(16).fill(0xaa));
    const b = await importWrappingKey(new Uint8Array(16).fill(0xbb));
    expect(wrappingKeysEqual(a, b)).toBe(false);
  });
});

describe("HKDF domain separation", () => {
  it("wrapped AES subkey has algorithm AES-CBC", async () => {
    const key = await importWrappingKey(bytes32);
    const { aesKey } = getWrappingKeyMaterial(key);
    expect(aesKey.algorithm.name).toBe("AES-CBC");
  });

  it("same raw bytes as WrappingKey and SigningKey produce different HMAC outputs", async () => {
    const rawBytes = new Uint8Array(32).fill(0xab);

    const wrappingKey = await importWrappingKey(rawBytes);
    const signingKey = await importSigningKey(rawBytes);

    const wrappingHmacKey = getWrappingKeyMaterial(wrappingKey).hmacKey;
    const signingHmacKey = getSigningKeyHmacKey(signingKey);

    const testData = new TextEncoder().encode("test-domain-separation");

    const wrapSig = await crypto.subtle.sign("HMAC", wrappingHmacKey, testData);
    const signSig = await crypto.subtle.sign("HMAC", signingHmacKey, testData);

    expect(new Uint8Array(wrapSig)).not.toEqual(new Uint8Array(signSig));
  });

  it("same raw bytes as WrappingKey and DigestKey produce different HMAC outputs", async () => {
    const rawBytes = new Uint8Array(32).fill(0xab);

    const wrappingKey = await importWrappingKey(rawBytes);
    const digestKey = await importDigestKey(rawBytes);

    const wrappingHmacKey = getWrappingKeyMaterial(wrappingKey).hmacKey;
    const digestHmacKey = getDigestKeyHmacKey(digestKey);

    const testData = new TextEncoder().encode("test-domain-separation");

    const wrapSig = await crypto.subtle.sign("HMAC", wrappingHmacKey, testData);
    const digestSig = await crypto.subtle.sign("HMAC", digestHmacKey, testData);

    expect(new Uint8Array(wrapSig)).not.toEqual(new Uint8Array(digestSig));
  });

  it("Wrapped, Signed, and Digest HMAC outputs are pairwise-distinct for the same IKM", async () => {
    const ikm = new Uint8Array(32).fill(0x77);

    const wrappingKey = await importWrappingKey(ikm);
    const signingKey = await importSigningKey(ikm);
    const digestKey = await importDigestKey(ikm);

    const testData = new TextEncoder().encode("three-codec-label-independence");

    const sigWrapped = new Uint8Array(
      await crypto.subtle.sign("HMAC", getWrappingKeyMaterial(wrappingKey).hmacKey, testData),
    );
    const sigSigned = new Uint8Array(
      await crypto.subtle.sign("HMAC", getSigningKeyHmacKey(signingKey), testData),
    );
    const sigDigest = new Uint8Array(
      await crypto.subtle.sign("HMAC", getDigestKeyHmacKey(digestKey), testData),
    );

    expect(sigWrapped).not.toEqual(sigSigned);
    expect(sigWrapped).not.toEqual(sigDigest);
    expect(sigSigned).not.toEqual(sigDigest);
  });

  it("two independent importWrappingKey calls on same bytes yield consistent HMAC output", async () => {
    const rawBytes = new Uint8Array(32).fill(0xcd);

    const key1 = await importWrappingKey(rawBytes);
    const key2 = await importWrappingKey(rawBytes);

    const testData = new TextEncoder().encode("consistency-check");
    const sig1 = await crypto.subtle.sign("HMAC", getWrappingKeyMaterial(key1).hmacKey, testData);
    const sig2 = await crypto.subtle.sign("HMAC", getWrappingKeyMaterial(key2).hmacKey, testData);

    expect(new Uint8Array(sig1)).toEqual(new Uint8Array(sig2));
  });

  it("two independent importWrappingKey calls on same bytes yield consistent AES output", async () => {
    const rawBytes = new Uint8Array(32).fill(0xcd);

    const key1 = await importWrappingKey(rawBytes);
    const key2 = await importWrappingKey(rawBytes);

    const iv = new Uint8Array(16).fill(0x01);
    const testData = new Uint8Array(16).fill(0x02);

    const enc1 = await crypto.subtle.encrypt(
      { name: "AES-CBC", iv },
      getWrappingKeyMaterial(key1).aesKey,
      testData,
    );
    const enc2 = await crypto.subtle.encrypt(
      { name: "AES-CBC", iv },
      getWrappingKeyMaterial(key2).aesKey,
      testData,
    );

    expect(new Uint8Array(enc1)).toEqual(new Uint8Array(enc2));
  });
});

describe("getWrappingKeyMaterial", () => {
  it("returns an AES-CBC CryptoKey", async () => {
    const key = await importWrappingKey(bytes16);
    const { aesKey } = getWrappingKeyMaterial(key);
    expect(aesKey).toHaveProperty("type");
    expect(aesKey.algorithm).toMatchObject({ name: "AES-CBC" });
  });

  it("returns an HMAC CryptoKey", async () => {
    const key = await importWrappingKey(bytes16);
    const { hmacKey } = getWrappingKeyMaterial(key);
    expect(hmacKey).toHaveProperty("type");
    expect(hmacKey.algorithm).toMatchObject({ name: "HMAC" });
  });

  it("throws for an unregistered handle", () => {
    const fake = Object.freeze({}) as WrappingKey;
    expect(() => getWrappingKeyMaterial(fake)).toThrow(Error);
  });
});
