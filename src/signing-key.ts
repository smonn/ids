import {
  assertValidKeyMaterialByteLength,
  assertValidKeyring,
  decodeKeyMaterial,
  encodeKeyMaterial,
} from "./key-material.js";

export { assertValidKeyring };

/** Wire encoding for signing key raw key bytes (not Crockford base32). */
export type SigningKeyFormat = "hex" | "base64url";

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
  assertValidKeyMaterialByteLength(bytes.length, "signing");
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
  return encodeKeyMaterial(bytes, format, "signing", "signing");
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
  return decodeKeyMaterial(encoded, format, "signing", "signing");
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
 * @deprecated Use {@link assertValidKeyring} with {@link signingKeysEqual} for a combined check, or rely on the codec constructor's built-in validation instead.
 */
export function assertNonEmptySigningKeyring(keys: readonly SigningKey[]): void {
  assertValidKeyring(keys, signingKeysEqual, "signing");
}

/**
 * Asserts that no two entries in the signing keyring share the same raw bytes.
 * @throws {IdsError} `duplicate_keyring_entry` if a duplicate is found.
 * @deprecated Use {@link assertValidKeyring} with {@link signingKeysEqual} for a combined check, or rely on the codec constructor's built-in validation instead.
 */
export function assertNonDuplicateSigningKeys(keys: readonly SigningKey[]): void {
  assertValidKeyring(keys, signingKeysEqual, "signing");
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
