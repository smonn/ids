/*
  This is based on Crockford's Base32 spec: https://www.crockford.com/base32.html
  One difference is that it uses lowercase instead of uppercase when encoding.
*/

import { invariant } from "./invariant.js";

export const alphabet = "0123456789abcdefghjkmnpqrstvwxyz";

const numberToCharLookup = alphabet.split("");

const charToNumberLookup = new Map<string, number>([
  ...numberToCharLookup.map((char, i) => [char, i] as const),
  ["o", 0],
  ["i", 1],
  ["l", 1],
]);

export function encodeBase32(bytes: Uint8Array): string {
  let result = "";
  let bits = 0;
  let value = 0;

  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      result += numberToCharLookup[(value >>> bits) & 0x1f];
    }
  }
  invariant(bits === 3, "expected three leftover bits");
  result += numberToCharLookup[(value << (5 - bits)) & 0x1f];
  return result;
}

export function decodeBase32(str: string): Uint8Array {
  const result = new Uint8Array(Math.floor((str.length * 5) / 8));
  let bits = 0;
  let value = 0;
  let index = 0;

  for (const char of str) {
    const v = charToNumberLookup.get(char.toLowerCase());
    invariant(v !== undefined, "invalid base32");
    value = (value << 5) | v;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      result[index++] = (value >>> bits) & 0xff;
    }
  }
  return result;
}
