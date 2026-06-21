import { decodeBase64Url, decodeHex, encodeBase64Url, encodeHex } from "./bytes.js";
import { IdsError } from "./error.js";

type KeyMaterialFormat = "hex" | "base64url";

const validByteLengths = new Set([16, 24, 32]);

function formatForError(value: unknown): string {
  try {
    return String(value);
  } catch {
    return "[unprintable]";
  }
}

function assertKeyMaterialFormat(
  format: unknown,
  noun: string,
): asserts format is KeyMaterialFormat {
  if (format !== "hex" && format !== "base64url") {
    throw new IdsError(
      "invalid_key_format",
      `invalid ${noun} key format: expected hex or base64url, got '${formatForError(format)}'`,
    );
  }
}

/** Throws `invalid_key_length` when `byteLength` is not 16, 24, or 32. */
export function assertValidKeyMaterialByteLength(byteLength: number, noun: string): void {
  if (!validByteLengths.has(byteLength)) {
    throw new IdsError(
      "invalid_key_length",
      `invalid ${noun} key length: expected 16, 24, or 32 bytes, got ${byteLength}`,
    );
  }
}

/**
 * Encodes raw key bytes as hex or base64url.
 *
 * `formatNoun` appears in format error messages; `lengthNoun` in length error messages.
 * For most key types both are the same (e.g. `"wrapping"`, `"signing"`). For the
 * Opaque key, they differ (`"opaque"` and `"AES"` respectively) to preserve the
 * original human-readable messages.
 */
export function encodeKeyMaterial(
  bytes: Uint8Array,
  format: unknown,
  formatNoun: string,
  lengthNoun: string,
): string {
  assertKeyMaterialFormat(format, formatNoun);
  assertValidKeyMaterialByteLength(bytes.length, lengthNoun);
  if (format === "hex") return encodeHex(bytes);
  return encodeBase64Url(bytes);
}

/**
 * Decodes a hex or base64url-encoded key string back to raw bytes.
 *
 * `formatNoun` appears in format error messages; `lengthNoun` in length error messages.
 */
export function decodeKeyMaterial(
  encoded: string,
  format: unknown,
  formatNoun: string,
  lengthNoun: string,
): Uint8Array {
  assertKeyMaterialFormat(format, formatNoun);
  let bytes: Uint8Array;
  if (format === "hex") {
    if (encoded.length === 0 || encoded.length % 2 !== 0) {
      throw new IdsError(
        "invalid_key_encoding",
        "invalid hex key: length must be a positive even number of characters",
      );
    }
    if (!/^[0-9a-fA-F]+$/.test(encoded)) {
      throw new IdsError("invalid_key_encoding", "invalid hex key: expected [0-9a-fA-F] only");
    }
    bytes = decodeHex(encoded);
  } else {
    try {
      bytes = decodeBase64Url(encoded);
    } catch {
      throw new IdsError("invalid_key_encoding", "invalid base64url key");
    }
  }
  assertValidKeyMaterialByteLength(bytes.length, lengthNoun);
  return bytes;
}
