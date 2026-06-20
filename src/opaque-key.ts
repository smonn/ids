import { decodeBase64Url, decodeHex, encodeBase64Url, encodeHex } from "./bytes.js";
import { IdsError } from "./error.js";

/** Wire encoding for opaque AES key material (not Crockford base32). */
export type OpaqueKeyFormat = "hex" | "base64url";

const validAesKeyByteLengths = new Set([16, 24, 32]);

declare const opaqueKeyBrand: unique symbol;

/**
 * Opaque imported handle for one AES key used by the Opaque Timestamp codec.
 *
 * Holds the underlying `CryptoKey` internally; callers never access it directly.
 * Obtain handles via {@link importOpaqueKey} and pass them to
 * `createOpaqueTimestampId` as the `key` option.
 *
 * Distinct from the `WrappingKey` used by `@smonn/ids/wrapped` — one raw
 * secret must not silently serve both codecs without an explicit import.
 */
export type OpaqueKey = {
  readonly [opaqueKeyBrand]: "OpaqueKey";
};

const opaqueKeyInternals = new WeakMap<OpaqueKey, CryptoKey>();

/**
 * Imports raw AES key bytes into an {@link OpaqueKey} handle for the Opaque
 * Timestamp codec.
 *
 * Accepts 16, 24, or 32 bytes (AES-128 / AES-192 / AES-256 strength).
 * To store or transport key material, use {@link encodeOpaqueKey} /
 * {@link decodeOpaqueKey} (`"hex"` or `"base64url"` — not Crockford base32).
 *
 * @param bytes - 16, 24, or 32 raw key bytes.
 */
export async function importOpaqueKey(bytes: Uint8Array): Promise<OpaqueKey> {
  assertValidAesKeyByteLength(bytes.length);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    bytes as Uint8Array<ArrayBuffer>,
    "AES-CBC",
    false,
    ["encrypt", "decrypt"],
  );
  const key = Object.freeze({}) as OpaqueKey;
  opaqueKeyInternals.set(key, cryptoKey);
  return key;
}

export function getOpaqueKeyCryptoKey(key: OpaqueKey): CryptoKey {
  const cryptoKey = opaqueKeyInternals.get(key);
  if (cryptoKey === undefined) {
    throw new Error("invalid opaque key");
  }
  return cryptoKey;
}

/**
 * Encodes raw AES key bytes for storage in env vars or secret managers.
 *
 * @param bytes - 16, 24, or 32 raw key bytes (AES-128/192/256).
 * @param format - `hex` (lowercase) or `base64url`.
 */
export function encodeOpaqueKey(bytes: Uint8Array, format: OpaqueKeyFormat): string {
  assertOpaqueKeyFormat(format);
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
  assertOpaqueKeyFormat(format);
  let bytes: Uint8Array;
  if (format === "hex") {
    if (encoded.length === 0 || encoded.length % 2 !== 0) {
      throw new IdsError(
        "invalid_key_format",
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
  assertValidAesKeyByteLength(bytes.length);
  return bytes;
}

function assertValidAesKeyByteLength(byteLength: number): void {
  if (!validAesKeyByteLengths.has(byteLength)) {
    throw new IdsError(
      "invalid_key_length",
      `invalid AES key length: expected 16, 24, or 32 bytes, got ${byteLength}`,
    );
  }
}

function assertOpaqueKeyFormat(format: unknown): asserts format is OpaqueKeyFormat {
  if (format !== "hex" && format !== "base64url") {
    throw new IdsError(
      "invalid_key_format",
      `invalid opaque key format: expected hex or base64url, got '${formatForError(format)}'`,
    );
  }
}

function formatForError(value: unknown): string {
  try {
    return String(value);
  } catch {
    return "[unprintable]";
  }
}
