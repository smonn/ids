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
  const s = crypto.randomUUID();
  target[0] = (hexCharCodeToNibble[s.charCodeAt(0)]! << 4) | hexCharCodeToNibble[s.charCodeAt(1)]!;
  target[1] = (hexCharCodeToNibble[s.charCodeAt(2)]! << 4) | hexCharCodeToNibble[s.charCodeAt(3)]!;
  target[2] = (hexCharCodeToNibble[s.charCodeAt(4)]! << 4) | hexCharCodeToNibble[s.charCodeAt(5)]!;
  target[3] = (hexCharCodeToNibble[s.charCodeAt(6)]! << 4) | hexCharCodeToNibble[s.charCodeAt(7)]!;
  target[4] = (hexCharCodeToNibble[s.charCodeAt(9)]! << 4) | hexCharCodeToNibble[s.charCodeAt(10)]!;
  target[5] =
    (hexCharCodeToNibble[s.charCodeAt(11)]! << 4) | hexCharCodeToNibble[s.charCodeAt(12)]!;
  target[6] =
    (hexCharCodeToNibble[s.charCodeAt(24)]! << 4) | hexCharCodeToNibble[s.charCodeAt(25)]!;
  target[7] =
    (hexCharCodeToNibble[s.charCodeAt(26)]! << 4) | hexCharCodeToNibble[s.charCodeAt(27)]!;
  target[8] =
    (hexCharCodeToNibble[s.charCodeAt(28)]! << 4) | hexCharCodeToNibble[s.charCodeAt(29)]!;
  target[9] =
    (hexCharCodeToNibble[s.charCodeAt(30)]! << 4) | hexCharCodeToNibble[s.charCodeAt(31)]!;
}
