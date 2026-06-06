import { decodeBase32, encodeBase32 } from "../base32.js";
import type { Id, Prefix } from "../types.js";
import { readTimestampMs, timestampByteLength } from "./timestamp-bytes.js";

// Payload is always 16 bytes on the wire (every codec). 16 bytes → 26 Crockford
// base32 chars. ADR-0002 codifies this as the shared wire-format invariant.
export const payloadByteLength: number = 16;
export const payloadBase32Length: number = Math.ceil((payloadByteLength * 8) / 5);

const timestampBase32Length = Math.ceil((timestampByteLength * 8) / 5);

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

/** Reads the millisecond timestamp from a trusted wire ID (first 6 payload bytes). */
export function readTimestampMsFromId<Brand extends string>(
  prefix: Prefix<Brand>,
  id: Id<Brand>,
): number {
  const base32 = id.slice(prefix.length, prefix.length + timestampBase32Length);
  return readTimestampMs(decodeBase32(base32));
}
