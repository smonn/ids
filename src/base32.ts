/*
  This is based on Crockford's Base32 spec: https://www.crockford.com/base32.html
  One difference is that it uses lowercase instead of uppercase when encoding.

  These functions are internal: callers (id.ts) guarantee that input is a
  16-byte buffer for encode, or a string of characters drawn from the alphabet
  for decode. Invalid input produces silent garbage rather than a thrown error,
  consistent with the trust-the-type rule in ADR-0003.
*/

export const alphabet = "0123456789abcdefghjkmnpqrstvwxyz";

const numberToCharLookup = alphabet.split("");

// charCode → 0–31 value. Covers both cases and the Crockford o/i/l aliases.
const INVALID = 0xff;
const charCodeToValue = new Uint8Array(256).fill(INVALID);
for (let i = 0; i < alphabet.length; i++) {
  const code = alphabet.charCodeAt(i);
  charCodeToValue[code] = i;
  if (code >= 97 && code <= 122) charCodeToValue[code - 32] = i;
}
charCodeToValue["o".charCodeAt(0)] = charCodeToValue["O".charCodeAt(0)] = 0;
charCodeToValue["i".charCodeAt(0)] = charCodeToValue["I".charCodeAt(0)] = 1;
charCodeToValue["l".charCodeAt(0)] = charCodeToValue["L".charCodeAt(0)] = 1;

export function encodeBase32(bytes: Uint8Array): string {
  let result = "";
  let bits = 0;
  let value = 0;

  for (let i = 0; i < bytes.length; i++) {
    value = (value << 8) | bytes[i]!;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      result += numberToCharLookup[(value >>> bits) & 0x1f];
    }
  }
  result += numberToCharLookup[(value << (5 - bits)) & 0x1f];
  return result;
}

export function decodeBase32(str: string): Uint8Array {
  const result = new Uint8Array(Math.floor((str.length * 5) / 8));
  let bits = 0;
  let value = 0;
  let index = 0;

  for (let i = 0; i < str.length; i++) {
    const v = charCodeToValue[str.charCodeAt(i)]!;
    value = (value << 5) | v;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      result[index++] = (value >>> bits) & 0xff;
    }
  }
  return result;
}
