import { describe, expect, it } from "vitest";
import {
  decryptPayload,
  deriveKey,
  encryptPayload,
  timingSafeEqual,
  writeLen32,
} from "./crypto.js";

describe("timingSafeEqual", () => {
  const sample = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);

  it("returns true for equal arrays", () => {
    expect(timingSafeEqual(sample, new Uint8Array(sample))).toBe(true);
  });

  it("returns false for arrays differing at first byte (no early-return bias)", () => {
    const b = new Uint8Array(sample);
    b[0] = b[0]! ^ 0xff;
    expect(timingSafeEqual(sample, b)).toBe(false);
  });

  it("returns false for arrays differing at a middle byte (no early-return bias)", () => {
    const b = new Uint8Array(sample);
    b[7] = b[7]! ^ 0xff;
    expect(timingSafeEqual(sample, b)).toBe(false);
  });

  it("returns false for arrays differing at last byte (no early-return bias)", () => {
    const b = new Uint8Array(sample);
    b[sample.length - 1] = b[sample.length - 1]! ^ 0xff;
    expect(timingSafeEqual(sample, b)).toBe(false);
  });

  it("returns false for arrays of different lengths", () => {
    expect(timingSafeEqual(sample, new Uint8Array(sample.length + 1))).toBe(false);
  });

  it("returns true for empty arrays", () => {
    expect(timingSafeEqual(new Uint8Array(0), new Uint8Array(0))).toBe(true);
  });
});

describe("encryptPayload / decryptPayload", () => {
  it("round-trips a 16-byte plaintext under a known AES-128 key", async () => {
    const rawKey = new Uint8Array(16).map((_, i) => i);
    const key = await crypto.subtle.importKey(
      "raw",
      rawKey as Uint8Array<ArrayBuffer>,
      "AES-CBC",
      false,
      ["encrypt", "decrypt"],
    );
    const plaintext = new Uint8Array(16).map((_, i) => i + 1);
    const encrypted = await encryptPayload(key, plaintext);
    expect(encrypted).toHaveLength(16);
    const decrypted = await decryptPayload(key, encrypted);
    expect(decrypted).toHaveLength(16);
    expect(decrypted).toEqual(plaintext);
  });

  it("round-trips a 16-byte plaintext under a known AES-256 key", async () => {
    const rawKey = new Uint8Array(32).map((_, i) => i * 2);
    const key = await crypto.subtle.importKey(
      "raw",
      rawKey as Uint8Array<ArrayBuffer>,
      "AES-CBC",
      false,
      ["encrypt", "decrypt"],
    );
    const plaintext = new Uint8Array([
      0xde, 0xad, 0xbe, 0xef, 0xca, 0xfe, 0xba, 0xbe, 0x01, 0x23, 0x45, 0x67, 0x89, 0xab, 0xcd,
      0xef,
    ]);
    const encrypted = await encryptPayload(key, plaintext);
    expect(encrypted).toHaveLength(16);
    const decrypted = await decryptPayload(key, encrypted);
    expect(decrypted).toEqual(plaintext);
  });
});

describe("deriveKey", () => {
  const rawBytes = new Uint8Array(32).fill(0x42);
  const info = new TextEncoder().encode("test/label");

  it("derives an HMAC key with sign usage", async () => {
    const key = await deriveKey(rawBytes, info, { name: "HMAC", hash: "SHA-256", length: 256 }, [
      "sign",
    ]);
    expect(key.algorithm.name).toBe("HMAC");
    expect(key.usages).toContain("sign");
    expect(key.extractable).toBe(false);
  });

  it("derives an AES-CBC key with encrypt/decrypt usages", async () => {
    const key = await deriveKey(rawBytes, info, { name: "AES-CBC", length: 256 }, [
      "encrypt",
      "decrypt",
    ]);
    expect(key.algorithm.name).toBe("AES-CBC");
    expect(key.usages).toContain("encrypt");
    expect(key.usages).toContain("decrypt");
    expect(key.extractable).toBe(false);
  });

  it("different info labels produce different derived keys", async () => {
    const infoA = new TextEncoder().encode("label-a");
    const infoB = new TextEncoder().encode("label-b");
    const spec = { name: "HMAC", hash: "SHA-256", length: 256 };
    const keyA = await deriveKey(rawBytes, infoA, spec, ["sign"]);
    const keyB = await deriveKey(rawBytes, infoB, spec, ["sign"]);
    const testData = new TextEncoder().encode("same-data");
    const sigA = new Uint8Array(await crypto.subtle.sign("HMAC", keyA, testData));
    const sigB = new Uint8Array(await crypto.subtle.sign("HMAC", keyB, testData));
    expect(sigA).not.toEqual(sigB);
  });

  it("same bytes and info produce the same derived key", async () => {
    const spec = { name: "HMAC", hash: "SHA-256", length: 256 };
    const key1 = await deriveKey(rawBytes, info, spec, ["sign"]);
    const key2 = await deriveKey(rawBytes, info, spec, ["sign"]);
    const testData = new TextEncoder().encode("consistency");
    const sig1 = new Uint8Array(await crypto.subtle.sign("HMAC", key1, testData));
    const sig2 = new Uint8Array(await crypto.subtle.sign("HMAC", key2, testData));
    expect(sig1).toEqual(sig2);
  });
});

describe("writeLen32", () => {
  it("writes a 32-bit big-endian value at offset 0", () => {
    const buf = new Uint8Array(4);
    writeLen32(0x01020304, buf, 0);
    expect(Array.from(buf)).toEqual([0x01, 0x02, 0x03, 0x04]);
  });

  it("writes zero correctly", () => {
    const buf = new Uint8Array(4);
    writeLen32(0, buf, 0);
    expect(Array.from(buf)).toEqual([0, 0, 0, 0]);
  });

  it("respects a non-zero offset", () => {
    const buf = new Uint8Array(8);
    writeLen32(0xdeadbeef, buf, 4);
    expect(Array.from(buf.subarray(0, 4))).toEqual([0, 0, 0, 0]);
    expect(Array.from(buf.subarray(4))).toEqual([0xde, 0xad, 0xbe, 0xef]);
  });

  it("writes the 32-bit maximum correctly", () => {
    const buf = new Uint8Array(4);
    writeLen32(0xffffffff, buf, 0);
    expect(Array.from(buf)).toEqual([0xff, 0xff, 0xff, 0xff]);
  });
});
