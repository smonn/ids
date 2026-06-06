import { decodeBase64Url, decodeHex, encodeBase64Url, encodeHex } from "./bytes.js";

/** Wire encoding for opaque AES key material (not Crockford base32). */
export type OpaqueKeyFormat = "hex" | "base64url";

const validAesKeyByteLengths = new Set([16, 24, 32]);

/**
 * Encodes raw AES key bytes for storage in env vars or secret managers.
 *
 * @param bytes - 16, 24, or 32 raw key bytes (AES-128/192/256).
 * @param format - `hex` (lowercase) or `base64url`.
 */
export function encodeOpaqueKey(bytes: Uint8Array, format: OpaqueKeyFormat): string {
  assertValidAesKeyByteLength(bytes.length);
  if (format === "hex") return encodeHex(bytes);
  return encodeBase64Url(bytes);
}

/**
 * Decodes key material emitted by `encodeOpaqueKey` (or `ids keygen`) back to raw bytes.
 *
 * @param encoded - Hex or base64url string.
 * @param format - Must match how the string was encoded.
 */
export function decodeOpaqueKey(encoded: string, format: OpaqueKeyFormat): Uint8Array {
  let bytes: Uint8Array;
  if (format === "hex") {
    if (encoded.length === 0 || encoded.length % 2 !== 0) {
      throw new Error("invalid hex key: length must be a positive even number of characters");
    }
    if (!/^[0-9a-fA-F]+$/.test(encoded)) {
      throw new Error("invalid hex key: expected [0-9a-fA-F] only");
    }
    bytes = decodeHex(encoded);
  } else {
    try {
      bytes = decodeBase64Url(encoded);
    } catch {
      throw new Error("invalid base64url key");
    }
  }
  assertValidAesKeyByteLength(bytes.length);
  return bytes;
}

function assertValidAesKeyByteLength(byteLength: number): void {
  if (!validAesKeyByteLengths.has(byteLength)) {
    throw new Error(`invalid AES key length: expected 16, 24, or 32 bytes, got ${byteLength}`);
  }
}
