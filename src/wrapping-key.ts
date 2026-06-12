import { decodeBase64Url, decodeHex, encodeBase64Url, encodeHex } from "./bytes.js";

/** Wire encoding for wrapping operator secret bytes (not Crockford base32). */
export type WrappingKeyFormat = "hex" | "base64url";

const validKeyByteLengths = new Set([16, 24, 32]);

const aesInfo = new TextEncoder().encode("@smonn/ids/wrapped/aes/v1");
const hmacInfo = new TextEncoder().encode("@smonn/ids/wrapped/hmac/v1");

declare const wrappingKeyBrand: unique symbol;

/** Opaque imported handle for one operator wrapping secret (derived AES + HMAC subkeys). */
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
 * Imports raw operator secret bytes into a {@link WrappingKey} handle.
 *
 * @param bytes - 16, 24, or 32 raw key bytes (AES-128/192/256).
 */
export async function importWrappingKey(bytes: Uint8Array): Promise<WrappingKey> {
  assertValidKeyByteLength(bytes.length);
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
 * Encodes raw wrapping operator secret bytes for storage in env vars or secret managers.
 */
export function encodeWrappingKey(bytes: Uint8Array, format: WrappingKeyFormat): string {
  assertWrappingKeyFormat(format);
  assertValidKeyByteLength(bytes.length);
  if (format === "hex") return encodeHex(bytes);
  return encodeBase64Url(bytes);
}

/**
 * Decodes key material emitted by {@link encodeWrappingKey} back to raw bytes.
 */
export function decodeWrappingKey(encoded: string, format: WrappingKeyFormat): Uint8Array {
  assertWrappingKeyFormat(format);
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
  assertValidKeyByteLength(bytes.length);
  return bytes;
}

/** Returns true when two handles were imported from the same raw operator secret. */
export function wrappingKeysEqual(a: WrappingKey, b: WrappingKey): boolean {
  const aInternals = getWrappingKeyInternals(a);
  const bInternals = getWrappingKeyInternals(b);
  if (aInternals.rawBytes.length !== bInternals.rawBytes.length) return false;
  for (let i = 0; i < aInternals.rawBytes.length; i++) {
    if (aInternals.rawBytes[i] !== bInternals.rawBytes[i]) return false;
  }
  return true;
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

function assertValidKeyByteLength(byteLength: number): void {
  if (!validKeyByteLengths.has(byteLength)) {
    throw new Error(`invalid wrapping key length: expected 16, 24, or 32 bytes, got ${byteLength}`);
  }
}

function assertWrappingKeyFormat(format: unknown): asserts format is WrappingKeyFormat {
  if (format !== "hex" && format !== "base64url") {
    throw new Error(
      `invalid wrapping key format: expected hex or base64url, got '${formatForError(format)}'`,
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
