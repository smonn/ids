const hexDigits = "0123456789abcdef";

const invalidNibble = 0xff;
const hexCharCodeToNibble = new Uint8Array(128).fill(invalidNibble);
for (let i = 0; i < 10; i++) hexCharCodeToNibble[48 + i] = i;
for (let i = 0; i < 6; i++) {
  hexCharCodeToNibble[97 + i] = 10 + i;
  hexCharCodeToNibble[65 + i] = 10 + i;
}

/** Lowercase hex encoding of raw bytes. */
export function encodeHex(bytes: Uint8Array): string {
  // oxlint-disable-next-line no-new-array
  const codes = new Array<number>(bytes.length * 2);
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i]!;
    codes[i * 2] = hexDigits.charCodeAt(b >>> 4);
    codes[i * 2 + 1] = hexDigits.charCodeAt(b & 0x0f);
  }
  return String.fromCharCode(...codes);
}

/** Decodes a hex string to raw bytes. Throws on non-hex input. */
export function decodeHex(encoded: string): Uint8Array {
  if (encoded.length % 2 !== 0) throw new Error("invalid hex");
  const out = new Uint8Array(encoded.length / 2);
  for (let i = 0; i < out.length; i++) {
    const hiCode = encoded.charCodeAt(i * 2);
    const loCode = encoded.charCodeAt(i * 2 + 1);
    if (hiCode >= hexCharCodeToNibble.length || loCode >= hexCharCodeToNibble.length) {
      throw new Error("invalid hex");
    }
    const hi = hexCharCodeToNibble[hiCode]!;
    const lo = hexCharCodeToNibble[loCode]!;
    if (hi === invalidNibble || lo === invalidNibble) {
      throw new Error("invalid hex");
    }
    out[i] = (hi << 4) | lo;
  }
  return out;
}

/** Base64url encoding without padding. */
export function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Shifts a 32-bit integer into four big-endian bytes at target[offset..offset+3]. */
export function writeLen32(value: number, target: Uint8Array, offset: number): void {
  target[offset] = (value >>> 24) & 0xff;
  target[offset + 1] = (value >>> 16) & 0xff;
  target[offset + 2] = (value >>> 8) & 0xff;
  target[offset + 3] = value & 0xff;
}

/** Decodes a base64url string to raw bytes. Throws on invalid input. */
export function decodeBase64Url(encoded: string): Uint8Array {
  const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
  const pad = (4 - (base64.length % 4)) % 4;
  const binary = atob(base64 + "=".repeat(pad));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}
