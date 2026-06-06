import type { Id, Prefix } from "../types.js";
import { payloadBytesFromId, toWireId } from "../wire/envelope.js";
import { payloadBase32Length, payloadByteLength } from "../wire/invariants.js";
import { readTimestampMs, timestampByteLength, writeTimestamp } from "../wire/timestamp-bytes.js";

const zeroIv = new Uint8Array(payloadByteLength);
const pkcsPad = 0x10;

function buildPlaintext(ms: number, rng: (target: Uint8Array) => void): Uint8Array {
  const plaintext = new Uint8Array(payloadByteLength);
  writeTimestamp(ms, plaintext);
  rng(plaintext.subarray(timestampByteLength, payloadByteLength));
  return plaintext;
}

async function encryptPayload(key: CryptoKey, plaintext: Uint8Array): Promise<Uint8Array> {
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
async function decryptPayload(key: CryptoKey, c1: Uint8Array): Promise<Uint8Array> {
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

/** Produces a canonical encrypted wire ID. Per-call plaintext/ciphertext buffers —
 * subtle dominates this path; reuse would be safe but not worth pinning to spec detail. */
export async function generateWireId<Brand extends string>(
  prefix: Prefix<Brand>,
  key: CryptoKey,
  rng: (target: Uint8Array) => void,
  ms: number,
): Promise<Id<Brand>> {
  const plaintext = buildPlaintext(ms, rng);
  const encrypted = await encryptPayload(key, plaintext);
  return toWireId(prefix, encrypted);
}

/** Decrypts and decodes the creation timestamp from a trusted wire ID. */
export async function extractTimestampFromId<Brand extends string>(
  prefix: Prefix<Brand>,
  key: CryptoKey,
  id: Id<Brand>,
): Promise<Date> {
  const plaintext = await decryptPayload(key, payloadBytesFromId(prefix, id));
  return new Date(readTimestampMs(plaintext));
}

/** Structural placeholder for JSON Schema (encrypt is async). */
export function schemaExample<Brand extends string>(prefix: Prefix<Brand>): string {
  return prefix + "0".repeat(payloadBase32Length);
}
