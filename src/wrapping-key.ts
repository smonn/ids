import {
  assertValidKeyMaterialByteLength,
  decodeKeyMaterial,
  encodeKeyMaterial,
} from "./key-material.js";

/** Wire encoding for wrapping operator secret bytes (not Crockford base32). */
export type WrappingKeyFormat = "hex" | "base64url";

const aesInfo = new TextEncoder().encode("@smonn/ids/wrapped/aes/v1");
const hmacInfo = new TextEncoder().encode("@smonn/ids/wrapped/hmac/v1");

declare const wrappingKeyBrand: unique symbol;

/**
 * Opaque imported handle for one operator wrapping secret.
 *
 * Holds derived AES and HMAC subkeys internally; callers never access subkeys
 * or raw `CryptoKey` values directly. Obtain handles via {@link importWrappingKey}
 * and pass them to `createWrappedKeyId` as the `keys` wrapping keyring.
 *
 * Distinct from the **Opaque key** used by `@smonn/ids/opaque` — one raw
 * secret must not silently serve both codecs without an explicit import.
 */
export type WrappingKey = {
  readonly [wrappingKeyBrand]: "WrappingKey";
};

type WrappingKeyInternals = {
  rawBytes: Uint8Array;
  aesKey: CryptoKey;
  hmacKey: CryptoKey;
};

export type WrappingKeyMaterial = {
  aesKey: CryptoKey;
  hmacKey: CryptoKey;
};

const internals = new WeakMap<WrappingKey, WrappingKeyInternals>();

/**
 * Import raw operator secret bytes into a {@link WrappingKey} handle.
 *
 * One raw secret derives into AES and HMAC subkeys held inside the returned
 * handle. Accepts 16, 24, or 32 bytes (AES-128 / AES-192 / AES-256 strength).
 * To store or transport key material, use {@link encodeWrappingKey} /
 * {@link decodeWrappingKey} (`"hex"` or `"base64url"` — not Crockford base32).
 *
 * @param bytes - 16, 24, or 32 raw key bytes.
 */
export async function importWrappingKey(bytes: Uint8Array): Promise<WrappingKey> {
  assertValidKeyMaterialByteLength(bytes.length, "wrapping");
  const aesKey = await deriveAesKey(bytes);
  const hmacKey = await deriveHmacKey(bytes);
  const key = Object.freeze({}) as WrappingKey;
  internals.set(key, {
    rawBytes: bytes.slice(),
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
 */
export function encodeWrappingKey(bytes: Uint8Array, format: WrappingKeyFormat): string {
  return encodeKeyMaterial(bytes, format, "wrapping", "wrapping");
}

/**
 * Decode key material emitted by {@link encodeWrappingKey} back to raw bytes.
 *
 * The result can be passed directly to {@link importWrappingKey}.
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
  const aInternals = getWrappingKeyInternals(a);
  const bInternals = getWrappingKeyInternals(b);
  if (aInternals.rawBytes.length !== bInternals.rawBytes.length) return false;
  let diff = 0;
  for (let i = 0; i < aInternals.rawBytes.length; i++) {
    diff |= aInternals.rawBytes[i]! ^ bInternals.rawBytes[i]!;
  }
  return diff === 0;
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
  if (keyInternals === undefined) {
    throw new Error("invalid wrapping key");
  }
  return keyInternals;
}

async function deriveAesKey(bytes: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey(
    "raw",
    bytes as Uint8Array<ArrayBuffer>,
    "HKDF",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(), info: aesInfo },
    base,
    { name: "AES-CBC", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function deriveHmacKey(bytes: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey(
    "raw",
    bytes as Uint8Array<ArrayBuffer>,
    "HKDF",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(), info: hmacInfo },
    base,
    { name: "HMAC", hash: "SHA-256", length: 256 },
    false,
    ["sign", "verify"],
  );
}
