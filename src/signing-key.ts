import { decodeBase64Url, decodeHex, encodeBase64Url, encodeHex } from "./bytes.js";
import { IdsError } from "./error.js";

/** Wire encoding for signing key raw key bytes (not Crockford base32). */
export type SigningKeyFormat = "hex" | "base64url";

const validKeyByteLengths = new Set([16, 24, 32]);

const hmacInfo = new TextEncoder().encode("ids/signed-timestamp/hmac");

declare const signingKeyBrand: unique symbol;

/**
 * Opaque imported handle for one operator signing key.
 *
 * Holds a single HMAC-SHA-256 key derived via HKDF under the domain-separation
 * label `ids/signed-timestamp/hmac`. The underlying `CryptoKey` is held
 * internally and never exposed to callers. Obtain handles via
 * {@link importSigningKey} and pass them to `createSignedTimestampId` as the
 * `keys` signing keyring.
 *
 * Distinct from both the **Opaque key** and the **Wrapping key** — the same
 * raw key material must not silently serve multiple codecs without an explicit import.
 */
export type SigningKey = {
  readonly [signingKeyBrand]: "SigningKey";
};

type SigningKeyInternals = {
  rawBytes: Uint8Array;
  hmacKey: CryptoKey;
};

const internals = new WeakMap<SigningKey, SigningKeyInternals>();

/**
 * Import raw operator key material into a {@link SigningKey} handle.
 *
 * Derives a single HMAC-SHA-256 key via HKDF under the domain-separation label
 * `ids/signed-timestamp/hmac`. Accepts 16, 24, or 32 bytes. To store or
 * transport key material, use {@link encodeSigningKey} / {@link decodeSigningKey}
 * (`"hex"` or `"base64url"` — not Crockford base32).
 *
 * @param bytes - 16, 24, or 32 raw key bytes.
 * @throws {IdsError} `invalid_key_length` if `bytes.length` is not 16, 24, or 32.
 */
export async function importSigningKey(bytes: Uint8Array): Promise<SigningKey> {
  assertValidKeyByteLength(bytes.length);
  const hmacKey = await deriveHmacKey(bytes);
  const key = Object.freeze({}) as SigningKey;
  internals.set(key, { rawBytes: bytes.slice(), hmacKey });
  return key;
}

/**
 * Encode raw signing operator key material for storage in env vars or secret managers.
 *
 * Supports `"hex"` (lowercase) and `"base64url"`. Output round-trips through
 * {@link decodeSigningKey} back to the original bytes.
 *
 * @throws {IdsError} `invalid_key_format` if `format` is not `"hex"` or `"base64url"`.
 * @throws {IdsError} `invalid_key_length` if `bytes.length` is not 16, 24, or 32.
 */
export function encodeSigningKey(bytes: Uint8Array, format: SigningKeyFormat): string {
  assertSigningKeyFormat(format);
  assertValidKeyByteLength(bytes.length);
  if (format === "hex") return encodeHex(bytes);
  return encodeBase64Url(bytes);
}

/**
 * Decode key material emitted by {@link encodeSigningKey} back to raw bytes.
 *
 * The result can be passed directly to {@link importSigningKey}.
 *
 * @throws {IdsError} `invalid_key_format` if `format` is not `"hex"` or `"base64url"`.
 * @throws {IdsError} `invalid_key_encoding` if the string is malformed for its format.
 * @throws {IdsError} `invalid_key_length` if the decoded bytes are not 16, 24, or 32 bytes.
 */
export function decodeSigningKey(encoded: string, format: SigningKeyFormat): Uint8Array {
  assertSigningKeyFormat(format);
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
  assertValidKeyByteLength(bytes.length);
  return bytes;
}

/**
 * Returns true when two handles were imported from the same raw key material.
 *
 * Uses a constant-time comparison so duplicate detection over key material does
 * not leak the position of the first differing byte through a timing side channel.
 */
export function signingKeysEqual(a: SigningKey, b: SigningKey): boolean {
  const aBytes = getSigningKeyInternals(a).rawBytes;
  const bBytes = getSigningKeyInternals(b).rawBytes;
  if (aBytes.length !== bBytes.length) return false;
  let diff = 0;
  for (let i = 0; i < aBytes.length; i++) {
    diff |= aBytes[i]! ^ bBytes[i]!;
  }
  return diff === 0;
}

/**
 * Returns the derived HMAC CryptoKey held inside the handle.
 *
 * Intentional module-internal escape hatch for codec implementations (e.g. `createSignedTimestampId`).
 * Not re-exported from `@smonn/ids/signed`; external callers cannot reach this.
 */
export function getSigningKeyHmacKey(key: SigningKey): CryptoKey {
  return getSigningKeyInternals(key).hmacKey;
}

/**
 * Asserts that a signing keyring is non-empty.
 * @throws {IdsError} `empty_keyring` if the array is empty.
 */
export function assertNonEmptySigningKeyring(keys: readonly SigningKey[]): void {
  if (keys.length === 0) {
    throw new IdsError("empty_keyring", "signing keyring must contain at least one key");
  }
}

/**
 * Asserts that no two entries in the signing keyring share the same raw bytes.
 * @throws {IdsError} `duplicate_keyring_entry` if a duplicate is found.
 */
export function assertNonDuplicateSigningKeys(keys: readonly SigningKey[]): void {
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      if (signingKeysEqual(keys[i]!, keys[j]!)) {
        throw new IdsError("duplicate_keyring_entry", "duplicate signing key in keyring");
      }
    }
  }
}

function getSigningKeyInternals(key: SigningKey): SigningKeyInternals {
  const keyInternals = internals.get(key);
  if (keyInternals === undefined) {
    throw new Error("invalid signing key");
  }
  return keyInternals;
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
    throw new IdsError(
      "invalid_key_length",
      `invalid signing key length: expected 16, 24, or 32 bytes, got ${byteLength}`,
    );
  }
}

function assertSigningKeyFormat(format: unknown): asserts format is SigningKeyFormat {
  if (format !== "hex" && format !== "base64url") {
    throw new IdsError(
      "invalid_key_format",
      `invalid signing key format: expected hex or base64url, got '${formatForError(format)}'`,
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
