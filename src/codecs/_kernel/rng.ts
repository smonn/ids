/** Default RNG: writes cryptographically random bytes via `crypto.getRandomValues`. */
export function defaultRng(target: Uint8Array): void {
  crypto.getRandomValues(target as Uint8Array<ArrayBuffer>);
}

// hex charCode → 0–15 nibble, for harvesting bytes out of a UUIDv4 string.
// Covers ['0'-'9' = 48–57] and ['a'-'f' = 97–102]; randomUUID is lowercase per spec.
const hexCharCodeToNibble = new Uint8Array(128);
for (let i = 0; i < 10; i++) hexCharCodeToNibble[48 + i] = i;
for (let i = 0; i < 6; i++) hexCharCodeToNibble[97 + i] = 10 + i;

/**
 * Harvests 10 random bytes from a UUID string into `target[0..9]`.
 *
 * Reads from string positions 0–7 (bytes 0–3), 9–12 (bytes 4–5), and 24–31
 * (bytes 6–9), skipping the version nibble at hex position 14 and the variant
 * nibble at hex position 19 in the UUID layout `xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx`.
 *
 * @internal
 */
export function harvestUUIDBytes(uuid: string, target: Uint8Array): void {
  target[0] =
    (hexCharCodeToNibble[uuid.charCodeAt(0)]! << 4) | hexCharCodeToNibble[uuid.charCodeAt(1)]!;
  target[1] =
    (hexCharCodeToNibble[uuid.charCodeAt(2)]! << 4) | hexCharCodeToNibble[uuid.charCodeAt(3)]!;
  target[2] =
    (hexCharCodeToNibble[uuid.charCodeAt(4)]! << 4) | hexCharCodeToNibble[uuid.charCodeAt(5)]!;
  target[3] =
    (hexCharCodeToNibble[uuid.charCodeAt(6)]! << 4) | hexCharCodeToNibble[uuid.charCodeAt(7)]!;
  target[4] =
    (hexCharCodeToNibble[uuid.charCodeAt(9)]! << 4) | hexCharCodeToNibble[uuid.charCodeAt(10)]!;
  target[5] =
    (hexCharCodeToNibble[uuid.charCodeAt(11)]! << 4) | hexCharCodeToNibble[uuid.charCodeAt(12)]!;
  target[6] =
    (hexCharCodeToNibble[uuid.charCodeAt(24)]! << 4) | hexCharCodeToNibble[uuid.charCodeAt(25)]!;
  target[7] =
    (hexCharCodeToNibble[uuid.charCodeAt(26)]! << 4) | hexCharCodeToNibble[uuid.charCodeAt(27)]!;
  target[8] =
    (hexCharCodeToNibble[uuid.charCodeAt(28)]! << 4) | hexCharCodeToNibble[uuid.charCodeAt(29)]!;
  target[9] =
    (hexCharCodeToNibble[uuid.charCodeAt(30)]! << 4) | hexCharCodeToNibble[uuid.charCodeAt(31)]!;
}

/**
 * Fast RNG for the 10-byte random tail shared by the plaintext timestamp layouts
 * (Timestamp and Reverse Timestamp codecs). Writes exactly `target[0..9]`.
 *
 * `crypto.randomUUID()` is ~7× faster than `crypto.getRandomValues` in Node 24
 * (~84 ns vs ~610 ns for a 16-byte fill — the UUID path has a tight fixed-format
 * fast path). A UUIDv4 string carries 122 cryptographically-random bits; we
 * harvest 10 fully-random bytes from positions where no version (hex 12) or
 * variant (hex 16) bits sit. String layout: `xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx`
 * — bytes 0–5 are string[0..7]+string[9..12], bytes 6–9 are string[24..31].
 *
 * Security-equivalent to `defaultRng` for a 10-byte tail (both are CSPRNG-backed,
 * fully-random bytes); the only difference is throughput.
 */
export function fastTenByteRng(target: Uint8Array): void {
  harvestUUIDBytes(crypto.randomUUID(), target);
}
