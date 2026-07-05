import { describe, expect, it } from "vitest";
import { isIdsError, type IdsErrorCode } from "../../error.js";
import {
  decodeDigestKey,
  encodeDigestKey,
  getDigestKeyHmacKey,
  importDigestKey,
  type DigestKey,
} from "./key.js";

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

describe("importDigestKey", () => {
  it("returns an opaque DigestKey handle from 16-byte material", async () => {
    const key = await importDigestKey(bytes16);
    expect(key).toBeDefined();
    expect(typeof key).toBe("object");
  });

  it("returns an opaque DigestKey handle from 24-byte material", async () => {
    const key = await importDigestKey(bytes24);
    expect(key).toBeDefined();
  });

  it("returns an opaque DigestKey handle from 32-byte material", async () => {
    const key = await importDigestKey(bytes32);
    expect(key).toBeDefined();
  });

  it("does not expose the underlying CryptoKey directly", async () => {
    const key = await importDigestKey(bytes16);
    expect(key).not.toHaveProperty("type");
    expect(key).not.toHaveProperty("algorithm");
    expect(key).not.toHaveProperty("extractable");
    expect(key).not.toHaveProperty("usages");
  });

  it("throws IdsError invalid_key_length for 8-byte input", async () => {
    await rejectsWithIdsError(importDigestKey(new Uint8Array(8)), "invalid_key_length");
  });

  it("throws IdsError invalid_key_length for 31-byte input", async () => {
    await rejectsWithIdsError(importDigestKey(new Uint8Array(31)), "invalid_key_length");
  });

  it("throws IdsError invalid_key_length for 0-byte input", async () => {
    await rejectsWithIdsError(importDigestKey(new Uint8Array(0)), "invalid_key_length");
  });
});

describe("encodeDigestKey / decodeDigestKey", () => {
  it.each([
    ["hex", "000102030405060708090a0b0c0d0e0f"],
    ["base64url", "AAECAwQFBgcICQoLDA0ODw"],
  ] as const)("round-trips 128-bit key as %s", (format, encoded) => {
    expect(encodeDigestKey(bytes16, format)).toBe(encoded);
    expect(decodeDigestKey(encoded, format)).toEqual(bytes16);
  });

  it("round-trips 256-bit key as hex", () => {
    const encoded = encodeDigestKey(bytes32, "hex");
    expect(encoded).toHaveLength(64);
    expect(decodeDigestKey(encoded, "hex")).toEqual(bytes32);
  });

  it("round-trips 192-bit key as base64url", () => {
    const encoded = encodeDigestKey(bytes24, "base64url");
    expect(decodeDigestKey(encoded, "base64url")).toEqual(bytes24);
  });

  it("encodeDigestKey throws IdsError invalid_key_format for unknown format", () => {
    throwsIdsError(() => encodeDigestKey(bytes16, "bogus" as never), "invalid_key_format");
  });

  it("decodeDigestKey throws IdsError invalid_key_format for unknown format", () => {
    throwsIdsError(() => decodeDigestKey("aabbccdd", "bogus" as never), "invalid_key_format");
  });

  it("encodeDigestKey throws IdsError invalid_key_length for wrong byte count", () => {
    throwsIdsError(() => encodeDigestKey(new Uint8Array(8), "hex"), "invalid_key_length");
  });

  it("decodeDigestKey throws IdsError invalid_key_encoding for odd-length hex", () => {
    throwsIdsError(() => decodeDigestKey("abc", "hex"), "invalid_key_encoding");
  });

  it("decodeDigestKey throws IdsError invalid_key_encoding for non-hex characters", () => {
    throwsIdsError(() => decodeDigestKey("gg", "hex"), "invalid_key_encoding");
  });

  it("decodeDigestKey throws IdsError invalid_key_encoding for invalid base64url", () => {
    throwsIdsError(() => decodeDigestKey("!!!", "base64url"), "invalid_key_encoding");
  });

  it("decodeDigestKey throws IdsError invalid_key_length when decoded bytes are wrong length", () => {
    throwsIdsError(() => decodeDigestKey("aabbcc", "hex"), "invalid_key_length");
  });
});

describe("getDigestKeyHmacKey", () => {
  it("getDigestKeyHmacKey throws on an unregistered handle (internal guard — plain Error)", () => {
    const fake = Object.freeze({}) as DigestKey;
    let err: unknown;
    try {
      getDigestKeyHmacKey(fake);
    } catch (e) {
      err = e;
    }
    // WeakMap handle-not-found is an internal invariant — stays plain Error, not IdsError
    expect(err instanceof Error).toBe(true);
    expect(isIdsError(err)).toBe(false);
    expect((err as Error).message).toContain("digest");
  });

  it("getDigestKeyHmacKey returns the CryptoKey for a valid handle", async () => {
    const key: DigestKey = await importDigestKey(new Uint8Array(32).fill(0x42));
    const cryptoKey = getDigestKeyHmacKey(key);
    expect(cryptoKey).toBeDefined();
  });

  it("returns a CryptoKey usable for HMAC sign/verify", async () => {
    const key = await importDigestKey(bytes16);
    const hmacKey = getDigestKeyHmacKey(key);
    expect(hmacKey).toHaveProperty("type");
    expect(hmacKey.algorithm).toMatchObject({ name: "HMAC" });
  });
});
