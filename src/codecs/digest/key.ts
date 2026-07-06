import type { webcrypto } from "node:crypto";
import { deriveKey } from "../_kernel/crypto.js";
import {
  assertValidKeyMaterialByteLength,
  createKeyHandleStore,
  decodeKeyMaterial,
  encodeKeyMaterial,
} from "../_kernel/key-material.js";

/** Wire encoding for digest operator key material (not Crockford base32). */
export type DigestKeyFormat = "hex" | "base64url";

const hmacInfo = new TextEncoder().encode("@smonn/ids/digest/hmac");

declare const digestKeyBrand: unique symbol;

/**
 * Opaque imported handle for one operator Digest key.
 *
 * Holds a single HMAC-SHA-256 key derived via HKDF under the domain-separation
 * label `@smonn/ids/digest/hmac`. The underlying `webcrypto.CryptoKey` is held internally and
 * never exposed to callers. Obtain handles via {@link importDigestKey} and pass
 * them to `createDigestId` as the `key` option.
 *
 * Unlike the other keyed codecs, the Digest codec holds exactly one key — there
 * is no keyring. Re-keying is a deliberate, breaking operator action (every ID
 * changes), never an in-band rotation.
 *
 * Distinct from the **Opaque key**, **Wrapping key**, and **Signing key** — the
 * same raw bytes imported as a `DigestKey` are cryptographically independent of
 * any other codec's key.
 */
export type DigestKey = {
  readonly [digestKeyBrand]: "DigestKey";
};

type DigestKeyInternals = {
  hmacKey: webcrypto.CryptoKey;
};

const digestKeyStore = createKeyHandleStore<DigestKey, DigestKeyInternals>("digest");

/**
 * Import raw operator key material into a {@link DigestKey} handle.
 *
 * Derives a single HMAC-SHA-256 key via HKDF under the domain-separation label
 * `@smonn/ids/digest/hmac`. Accepts 16, 24, or 32 bytes. To store or transport key
 * material, use {@link encodeDigestKey} / {@link decodeDigestKey}
 * (`"hex"` or `"base64url"` — not Crockford base32).
 *
 * @param bytes - 16, 24, or 32 raw key bytes.
 * @throws {IdsError} `invalid_key_length` if `bytes.length` is not 16, 24, or 32.
 */
export async function importDigestKey(bytes: Uint8Array): Promise<DigestKey> {
  assertValidKeyMaterialByteLength(bytes.length, "digest");
  const hmacKey = await deriveKey(bytes, hmacInfo, { name: "HMAC", hash: "SHA-256", length: 256 }, [
    "sign",
  ]);
  return digestKeyStore.make({ hmacKey });
}

/**
 * Encode raw digest operator key material for storage in env vars or secret managers.
 *
 * Supports `"hex"` (lowercase) and `"base64url"`. Output round-trips through
 * {@link decodeDigestKey} back to the original bytes.
 *
 * @throws {IdsError} `invalid_key_format` if `format` is not `"hex"` or `"base64url"`.
 * @throws {IdsError} `invalid_key_length` if `bytes.length` is not 16, 24, or 32.
 */
export function encodeDigestKey(bytes: Uint8Array, format: DigestKeyFormat): string {
  return encodeKeyMaterial(bytes, format, "digest", "digest");
}

/**
 * Decode key material emitted by {@link encodeDigestKey} back to raw bytes.
 *
 * The result can be passed directly to {@link importDigestKey}.
 *
 * @throws {IdsError} `invalid_key_format` if `format` is not `"hex"` or `"base64url"`.
 * @throws {IdsError} `invalid_key_encoding` if the string is malformed for its format.
 * @throws {IdsError} `invalid_key_length` if the decoded bytes are not 16, 24, or 32 bytes.
 */
export function decodeDigestKey(encoded: string, format: DigestKeyFormat): Uint8Array {
  return decodeKeyMaterial(encoded, format, "digest", "digest");
}

/**
 * Returns the derived HMAC webcrypto.CryptoKey held inside the handle.
 *
 * Intentional module-internal escape hatch for codec implementations.
 * Not re-exported from `@smonn/ids/digest`; external callers cannot reach this.
 */
export function getDigestKeyHmacKey(key: DigestKey): webcrypto.CryptoKey {
  return digestKeyStore.get(key).hmacKey;
}
