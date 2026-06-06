// Timestamp byte layout: first N bytes of the plaintext payload encode a
// big-endian Unix-ms timestamp. Shared by every codec whose plaintext begins
// with a timestamp (Timestamp, Opaque, Signed, Reverse). The Derived codec
// does not use this.
export const timestampByteLength: number = 6;

/** Write the timestamp in big-endian; encoded via mod-256 to avoid 32-bit bitwise coercion. */
export function writeTimestamp(ms: number, buffer: Uint8Array): void {
  if (Number.isNaN(ms)) throw new Error("timestamp is not a number");
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
