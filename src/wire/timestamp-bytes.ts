import { IdsError } from "../error.js";
import { decodeBase32 } from "./base32.js";

// Timestamp byte layout: first N bytes of the plaintext payload encode a
// big-endian Unix-ms timestamp. Shared by timestamp-family layouts.
export const timestampByteLength: number = 6;

const timestampBase32Length: number = Math.ceil((timestampByteLength * 8) / 5);

/** Write the timestamp in big-endian; encoded via mod-256 to avoid 32-bit bitwise coercion. */
export function writeTimestamp(ms: number, buffer: Uint8Array): void {
  if (!Number.isInteger(ms)) throw new IdsError("invalid_timestamp", "timestamp is not an integer");
  if (ms < 0) throw new IdsError("invalid_timestamp", "timestamp is negative");
  if (ms >= 2 ** (timestampByteLength * 8)) {
    throw new IdsError("invalid_timestamp", "timestamp exceeds 48-bit range");
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

/** Decodes ms from the first 10 base32 chars of a payload suffix (partial decode).
 * Callers always pass `id.slice(prefix.length)` where `id: Id<Brand>` — the Id
 * brand guarantees that safeParse() / parse() normalised any alias chars at the
 * parse boundary (is() rejects aliases rather than normalising them), so the
 * leading 10-char timestamp slice is canonical Crockford alphabet and safe to
 * pass to decodeBase32 without further guards.
 */
export function readTimestampMsFromBase32Suffix(base32Suffix: string): number {
  return readTimestampMs(decodeBase32(base32Suffix.slice(0, timestampBase32Length)));
}
