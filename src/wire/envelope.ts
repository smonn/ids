import { decodeBase32, encodeBase32 } from "./base32.js";
import type { Id, Prefix } from "../types.js";

/** Encodes a 16-byte payload as lowercase Crockford base32 (26 chars). */
function encodePayload(bytes: Uint8Array): string {
  return encodeBase32(bytes);
}

/** Decodes a 26-char base32 payload suffix to 16 bytes. Trust-the-type. */
function decodePayload(base32: string): Uint8Array {
  return decodeBase32(base32);
}

/** Composes a canonical wire ID from a prefix and 16-byte payload. */
export function toWireId<Brand extends string>(
  prefix: Prefix<Brand>,
  payload: Uint8Array,
): Id<Brand> {
  return (prefix + encodePayload(payload)) as Id<Brand>;
}

/** Decodes the full 16-byte payload from a trusted wire ID. */
export function payloadBytesFromId<Brand extends string>(
  prefix: Prefix<Brand>,
  id: Id<Brand>,
): Uint8Array {
  return decodePayload(id.slice(prefix.length));
}
