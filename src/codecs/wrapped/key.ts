import type { webcrypto } from "node:crypto";
import { deriveKey, timingSafeEqual } from "../_kernel/crypto.js";
import {
  assertValidKeyMaterialByteLength,
  assertValidKeyring,
  decodeKeyMaterial,
  encodeKeyMaterial,
} from "../_kernel/key-material.js";

export { assertValidKeyring };

/** Wire encoding for wrapping operator secret bytes (not Crockford base32). */
export type WrappingKeyFormat = "hex" | "base64url";

const aesInfo = new TextEncoder().encode("@smonn/ids/wrapped/aes");
const hmacInfo = new TextEncoder().encode("@smonn/ids/wrapped/hmac");

declare const wrappingKeyBrand: unique symbol;

/**
 * Opaque imported handle for one operator wrapping secret.
 *
 * Holds derived AES and HMAC subkeys internally; callers never access subkeys
 * or raw `webcrypto.CryptoKey` values directly. Obtain handles via {@link importWrappingKey}
 * and pass them to `createWrappedKeyId` as the `keys` wrapping keyring.
 *
 * Distinct from the **Opaque key** used by `@smonn/ids/opaque` — one raw
 * secret must not silently serve both codecs without an explicit import.
 */
export type WrappingKey = {
  readonly [wrappingKeyBrand]: "WrappingKey";
};

type WrappingKeyInternals = {
  keyDigest: Uint8Array;
  aesKey: webcrypto.CryptoKey;
  hmacKey: webcrypto.CryptoKey;
};

export type WrappingKeyMaterial = {
  aesKey: webcrypto.CryptoKey;
  hmacKey: webcrypto.CryptoKey;
};

const internals = new WeakMap<WrappingKey, WrappingKeyInternals>();

/**
 * Import raw operator secret bytes into a {@link WrappingKey} handle.
 *
 * The bytes are HKDF **input keying material**, not raw AES or HMAC keys: the
 * codec derives an **AES-256** subkey and an **HMAC-SHA-256** subkey via HKDF
 * under the labels `@smonn/ids/wrapped/aes` and `@smonn/ids/wrapped/hmac`.
 * Accepts 16, 24, or 32 bytes; the input size sets the entropy floor only — a
 * 16-byte handle still yields AES-256 and HMAC-SHA-256 subkeys with a 128-bit
 * entropy floor. To store or transport key material, use {@link encodeWrappingKey} /
 * {@link decodeWrappingKey} (`"hex"` or `"base64url"` — not Crockford base32).
 *
 * @param bytes - 16, 24, or 32 raw key bytes.
 * @throws {IdsError} `invalid_key_length` if `bytes.length` is not 16, 24, or 32.
 */
export async function importWrappingKey(bytes: Uint8Array): Promise<WrappingKey> {
  assertValidKeyMaterialByteLength(bytes.length, "wrapping");
  const [aesKey, hmacKey, digestBuffer] = await Promise.all([
    deriveKey(bytes, aesInfo, { name: "AES-CBC", length: 256 }, ["encrypt", "decrypt"]),
    deriveKey(bytes, hmacInfo, { name: "HMAC", hash: "SHA-256", length: 256 }, ["sign", "verify"]),
    crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>),
  ]);
  const key = Object.freeze({}) as WrappingKey;
  internals.set(key, {
    keyDigest: new Uint8Array(digestBuffer),
    aesKey,
    hmacKey,
  });
  return key;
}

/**
 * Encode raw wrapping operator secret bytes for storage in env vars or secret managers.
 *
 * Supports `"hex"` (lowercase) and `"base64url"`. Output round-trips through
 * {@link decodeWrappingKey} back to the original bytes.
 *
 * @throws {IdsError} `invalid_key_format` if `format` is not `"hex"` or `"base64url"`.
 * @throws {IdsError} `invalid_key_length` if `bytes.length` is not 16, 24, or 32.
 */
export function encodeWrappingKey(bytes: Uint8Array, format: WrappingKeyFormat): string {
  return encodeKeyMaterial(bytes, format, "wrapping", "wrapping");
}

/**
 * Decode key material emitted by {@link encodeWrappingKey} back to raw bytes.
 *
 * The result can be passed directly to {@link importWrappingKey}.
 *
 * @throws {IdsError} `invalid_key_format` if `format` is not `"hex"` or `"base64url"`.
 * @throws {IdsError} `invalid_key_encoding` if the string is malformed for its format.
 * @throws {IdsError} `invalid_key_length` if the decoded bytes are not 16, 24, or 32 bytes.
 */
export function decodeWrappingKey(encoded: string, format: WrappingKeyFormat): Uint8Array {
  return decodeKeyMaterial(encoded, format, "wrapping", "wrapping");
}

/**
 * Returns true when two handles were imported from the same raw operator secret.
 *
 * Uses a constant-time comparison so duplicate detection over key material does
 * not leak the position of the first differing byte through a timing side channel.
 */
export function wrappingKeysEqual(a: WrappingKey, b: WrappingKey): boolean {
  return timingSafeEqual(
    getWrappingKeyInternals(a).keyDigest,
    getWrappingKeyInternals(b).keyDigest,
  );
}

export function getWrappingKeyMaterial(key: WrappingKey): WrappingKeyMaterial {
  const keyInternals = getWrappingKeyInternals(key);
  return {
    aesKey: keyInternals.aesKey,
    hmacKey: keyInternals.hmacKey,
  };
}

function getWrappingKeyInternals(key: WrappingKey): WrappingKeyInternals {
  const keyInternals = internals.get(key);
  /* v8 ignore next -- defensive guard; only reachable with a forged WrappingKey handle */
  if (keyInternals === undefined) throw new Error("invalid wrapping key");
  return keyInternals;
}
