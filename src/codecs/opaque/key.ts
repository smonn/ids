import type { webcrypto } from "node:crypto";
import {
  assertValidKeyMaterialByteLength,
  decodeKeyMaterial,
  encodeKeyMaterial,
} from "../_kernel/key-material.js";

/** Wire encoding for opaque AES key material (not Crockford base32). */
export type OpaqueKeyFormat = "hex" | "base64url";

declare const opaqueKeyBrand: unique symbol;

/**
 * Opaque imported handle for one AES key used by the Opaque Timestamp codec.
 *
 * Holds the underlying `webcrypto.CryptoKey` internally; callers never access it directly.
 * Obtain handles via {@link importOpaqueKey} and pass them to
 * `createOpaqueTimestampId` as the `key` option.
 *
 * Distinct from the `WrappingKey` used by `@smonn/ids/wrapped` — one raw
 * secret must not silently serve both codecs without an explicit import.
 */
export type OpaqueKey = {
  readonly [opaqueKeyBrand]: "OpaqueKey";
};

const opaqueKeyInternals = new WeakMap<OpaqueKey, webcrypto.CryptoKey>();

/**
 * Imports raw AES key bytes into an {@link OpaqueKey} handle for the Opaque
 * Timestamp codec.
 *
 * Accepts 16, 24, or 32 bytes (AES-128 / AES-192 / AES-256 strength).
 * To store or transport key material, use {@link encodeOpaqueKey} /
 * {@link decodeOpaqueKey} (`"hex"` or `"base64url"` — not Crockford base32).
 *
 * @param bytes - 16, 24, or 32 raw key bytes.
 * @throws {IdsError} `invalid_key_length` if `bytes.length` is not 16, 24, or 32.
 */
export async function importOpaqueKey(bytes: Uint8Array): Promise<OpaqueKey> {
  assertValidKeyMaterialByteLength(bytes.length, "AES");
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

export function getOpaqueKeyCryptoKey(key: OpaqueKey): webcrypto.CryptoKey {
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
 * @throws {IdsError} `invalid_key_format` if `format` is not `"hex"` or `"base64url"`.
 * @throws {IdsError} `invalid_key_length` if `bytes.length` is not 16, 24, or 32.
 */
export function encodeOpaqueKey(bytes: Uint8Array, format: OpaqueKeyFormat): string {
  return encodeKeyMaterial(bytes, format, "opaque", "AES");
}

/**
 * Decodes key material emitted by `encodeOpaqueKey` (or `ids keygen`) back to raw bytes.
 *
 * @param encoded - Hex or base64url string.
 * @param format - Must match how the string was encoded.
 * @throws {IdsError} `invalid_key_format` if `format` is not `"hex"` or `"base64url"`.
 * @throws {IdsError} `invalid_key_encoding` if the string is malformed for its format.
 * @throws {IdsError} `invalid_key_length` if the decoded bytes are not 16, 24, or 32 bytes.
 */
export function decodeOpaqueKey(encoded: string, format: OpaqueKeyFormat): Uint8Array {
  return decodeKeyMaterial(encoded, format, "opaque", "AES");
}
