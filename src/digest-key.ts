import {
  assertValidKeyMaterialByteLength,
  decodeKeyMaterial,
  encodeKeyMaterial,
} from "./codecs/_kernel/key-material.js";

/** Wire encoding for digest operator key material (not Crockford base32). */
export type DigestKeyFormat = "hex" | "base64url";

const hmacInfo = new TextEncoder().encode("ids/digest/hmac");

declare const digestKeyBrand: unique symbol;

/**
 * Opaque imported handle for one operator Digest key.
 *
 * Holds a single HMAC-SHA-256 key derived via HKDF under the domain-separation
 * label `ids/digest/hmac`. The underlying `CryptoKey` is held internally and
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
  hmacKey: CryptoKey;
};

const internals = new WeakMap<DigestKey, DigestKeyInternals>();

/**
 * Import raw operator key material into a {@link DigestKey} handle.
 *
 * Derives a single HMAC-SHA-256 key via HKDF under the domain-separation label
 * `ids/digest/hmac`. Accepts 16, 24, or 32 bytes. To store or transport key
 * material, use {@link encodeDigestKey} / {@link decodeDigestKey}
 * (`"hex"` or `"base64url"` — not Crockford base32).
 *
 * @param bytes - 16, 24, or 32 raw key bytes.
 * @throws {IdsError} `invalid_key_length` if `bytes.length` is not 16, 24, or 32.
 */
export async function importDigestKey(bytes: Uint8Array): Promise<DigestKey> {
  assertValidKeyMaterialByteLength(bytes.length, "digest");
  const hmacKey = await deriveHmacKey(bytes);
  const key = Object.freeze({}) as DigestKey;
  internals.set(key, { hmacKey });
  return key;
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
 * Returns the derived HMAC CryptoKey held inside the handle.
 *
 * Intentional module-internal escape hatch for codec implementations.
 * Not re-exported from `@smonn/ids/digest`; external callers cannot reach this.
 */
export function getDigestKeyHmacKey(key: DigestKey): CryptoKey {
  const keyInternals = internals.get(key);
  /* v8 ignore next -- defensive guard; only reachable with a forged DigestKey handle */
  if (keyInternals === undefined) throw new Error("invalid digest key");
  return keyInternals.hmacKey;
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
    ["sign"],
  );
}
