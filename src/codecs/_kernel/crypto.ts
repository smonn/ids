import type { webcrypto } from "node:crypto";
import { payloadByteLength } from "../../wire/invariants.js";

const zeroIv = new Uint8Array(payloadByteLength);
const pkcsPad = 0x10;

export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

export async function encryptPayload(
  key: webcrypto.CryptoKey,
  plaintext: Uint8Array,
): Promise<Uint8Array> {
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-CBC", iv: zeroIv },
      key,
      plaintext as Uint8Array<ArrayBuffer>,
    ),
  );
  return encrypted.subarray(0, payloadByteLength);
}

// AES-CBC strip-and-reconstruct decrypt (ADR-0004). The wire carries only C1
// (16 bytes); C2 = AES_K(P2 XOR C1) where P2 is the PKCS#7 pad block (0x10×16).
// Recompute C2 via CBC encrypt of (P2 XOR C1) with IV=0, then decrypt C1‖C2.
export async function decryptPayload(
  key: webcrypto.CryptoKey,
  c1: Uint8Array,
): Promise<Uint8Array> {
  const c2Input = new Uint8Array(payloadByteLength);
  for (let i = 0; i < payloadByteLength; i++) c2Input[i] = pkcsPad ^ c1[i]!;
  const c2Encrypted = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-CBC", iv: zeroIv },
      key,
      c2Input as Uint8Array<ArrayBuffer>,
    ),
  );
  const ciphertext = new Uint8Array(payloadByteLength * 2);
  ciphertext.set(c1, 0);
  ciphertext.set(c2Encrypted.subarray(0, payloadByteLength), payloadByteLength);
  return new Uint8Array(
    await crypto.subtle.decrypt(
      { name: "AES-CBC", iv: zeroIv },
      key,
      ciphertext as Uint8Array<ArrayBuffer>,
    ),
  );
}

export function writeLen32(value: number, target: Uint8Array, offset: number): void {
  target[offset] = (value >>> 24) & 0xff;
  target[offset + 1] = (value >>> 16) & 0xff;
  target[offset + 2] = (value >>> 8) & 0xff;
  target[offset + 3] = value & 0xff;
}

export async function deriveKey(
  bytes: Uint8Array,
  info: Uint8Array,
  keySpec:
    | webcrypto.AlgorithmIdentifier
    | webcrypto.AesDerivedKeyParams
    | webcrypto.HmacImportParams,
  keyUsages: webcrypto.KeyUsage[],
): Promise<webcrypto.CryptoKey> {
  const base = await crypto.subtle.importKey(
    "raw",
    bytes as Uint8Array<ArrayBuffer>,
    "HKDF",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(),
      info: info as Uint8Array<ArrayBuffer>,
    },
    base,
    keySpec,
    false,
    keyUsages,
  );
}
