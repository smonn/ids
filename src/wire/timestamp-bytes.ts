import { decodeBase32 } from "../base32.js";

// Timestamp byte layout: first N bytes of the plaintext payload encode a
// big-endian Unix-ms timestamp. Shared by timestamp-family layouts.
export const timestampByteLength: number = 6;

const timestampBase32Length: number = Math.ceil((timestampByteLength * 8) / 5);

/** Write the timestamp in big-endian; encoded via mod-256 to avoid 32-bit bitwise coercion. */
export function writeTimestamp(ms: number, buffer: Uint8Array): void {
  if (Number.isNaN(ms)) throw new Error("timestamp is not a number");
  if (!Number.isInteger(ms)) throw new Error("timestamp is not an integer");
  if (ms < 0) throw new Error("timestamp is negative");
  if (ms >= 2 ** (timestampByteLength * 8)) {
    throw new Error("timestamp exceeds 48-bit range");
  }
  for (let i = timestampByteLength - 1; i >= 0; i--) {
    buffer[i] = ms % 256;
    ms = Math.floor(ms / 256);
  }
}

/** Decode the first `timestampByteLength` bytes of a buffer as a big-endian unsigned millisecond timestamp. */
export function readTimestampMs(buffer: Uint8Array): number {
  let ms = 0;
  for (let i = 0; i < timestampByteLength; i++) ms = ms * 256 + buffer[i]!;
  return ms;
}

/** Decodes ms from the first 10 base32 chars of a payload suffix (partial decode). */
export function readTimestampMsFromBase32Suffix(base32Suffix: string): number {
  return readTimestampMs(decodeBase32(base32Suffix.slice(0, timestampBase32Length)));
}
