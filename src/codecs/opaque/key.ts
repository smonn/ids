import type { webcrypto } from "node:crypto";
import { deriveKey } from "../_kernel/crypto.js";
import {
  assertValidKeyMaterialByteLength,
  createKeyHandleStore,
  decodeKeyMaterial,
  encodeKeyMaterial,
} from "../_kernel/key-material.js";

/** Wire encoding for opaque AES key material (not Crockford base32). */
export type OpaqueKeyFormat = "hex" | "base64url";

// HKDF domain-separation label for the Opaque AES key; see ADR-0019 / ADR-0027.
const aesInfo = new TextEncoder().encode("@smonn/ids/opaque/aes");

declare const opaqueKeyBrand: unique symbol;

/**
 * Opaque imported handle for the Opaque Timestamp codec's AES-256 key.
 *
 * Holds the underlying `webcrypto.CryptoKey` internally; callers never access it directly.
 * Obtain handles via {@link importOpaqueKey} and pass them to
 * `createOpaqueTimestampId` as the `key` option.
 *
 * The same raw secret may safely back an `OpaqueKey` and any other codec's
 * handle (a **primary secret**): each codec derives its key under a distinct
 * HKDF label, so the derived keys are independent — but each codec needs its
 * own explicit import. See ADR-0027.
 */
export type OpaqueKey = {
  readonly [opaqueKeyBrand]: "OpaqueKey";
};

const opaqueKeyStore = createKeyHandleStore<OpaqueKey, webcrypto.CryptoKey>("opaque");

/**
 * Imports operator key material into an {@link OpaqueKey} handle for the Opaque
 * Timestamp codec.
 *
 * The bytes are HKDF **input keying material**, not the AES key itself: the
 * codec derives an **AES-256** key from them via HKDF under the label
 * `@smonn/ids/opaque/aes` (ADR-0027). Accepts 16, 24, or 32 bytes; the input
 * size sets the entropy floor only — a 16-byte handle still yields AES-256 with
 * a 128-bit entropy floor. To store or transport key material, use
 * {@link encodeOpaqueKey} / {@link decodeOpaqueKey} (`"hex"` or `"base64url"` —
 * not Crockford base32).
 *
 * @param bytes - 16, 24, or 32 bytes of raw key material.
 * @throws {IdsError} `invalid_key_length` if `bytes.length` is not 16, 24, or 32.
 */
export async function importOpaqueKey(bytes: Uint8Array): Promise<OpaqueKey> {
  assertValidKeyMaterialByteLength(bytes.length, "AES");
  const cryptoKey = await deriveKey(bytes, aesInfo, { name: "AES-CBC", length: 256 }, [
    "encrypt",
    "decrypt",
  ]);
  return opaqueKeyStore.make(cryptoKey);
}

export function getOpaqueKeyCryptoKey(key: OpaqueKey): webcrypto.CryptoKey {
  return opaqueKeyStore.get(key);
}

/**
 * Encodes raw Opaque key material bytes for storage in env vars or secret managers.
 *
 * @param bytes - 16, 24, or 32 raw Opaque key material bytes.
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
