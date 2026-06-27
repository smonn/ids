/*
  This is based on Crockford's Base32 spec: https://www.crockford.com/base32.html
  One difference is that it uses lowercase instead of uppercase when encoding.

  These functions are internal: codec constructors guarantee that input is a
  16-byte buffer for encode, or a string of characters drawn from the alphabet
  for decode. Invalid input produces silent garbage rather than a thrown error,
  consistent with the trust-the-type rule in ADR-0003.
*/

export const alphabet = "0123456789abcdefghjkmnpqrstvwxyz";

// 0–31 → ASCII char code, for write-into-codes-then-fromCharCode encoding.
const valueToCharCode = new Uint8Array(32);
for (let i = 0; i < 32; i++) valueToCharCode[i] = alphabet.charCodeAt(i);

// charCode → 0–31 value. Canonical lowercase only; upstream resolves case and
// o/i/l aliases before any string reaches decodeBase32.
const INVALID = 0xff;
const charCodeToValue = new Uint8Array(256).fill(INVALID);
for (let i = 0; i < alphabet.length; i++) charCodeToValue[alphabet.charCodeAt(i)] = i;

export function encodeBase32(bytes: Uint8Array): string {
  // Build an Array<number> of char codes and pass it to fromCharCode.apply.
  // Faster than `result += char` (avoids cons-string overhead) and than
  // Uint8Array variants (apply has a fast path for plain Arrays).
  // oxlint-disable-next-line no-new-array
  const codes = new Array<number>(Math.ceil((bytes.length * 8) / 5));
  let chi = 0;
  let bits = 0;
  let value = 0;

  for (let i = 0; i < bytes.length; i++) {
    value = (value << 8) | bytes[i]!;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      codes[chi++] = valueToCharCode[(value >>> bits) & 0x1f]!;
    }
  }
  if (bits > 0) {
    codes[chi++] = valueToCharCode[(value << (5 - bits)) & 0x1f]!;
  }
  // Fixed-size precondition: encode is called only on 16-byte payloads, producing
  // 26 chars — well below the V8 ~65535 apply() arg-count ceiling. A caller
  // passing a larger buffer would need to chunk rather than use apply().
  return String.fromCharCode.apply(null, codes);
}

export function decodeBase32(str: string): Uint8Array {
  const result = new Uint8Array(Math.floor((str.length * 5) / 8));
  let bits = 0;
  let value = 0;
  let index = 0;

  for (let i = 0; i < str.length; i++) {
    // Input is pre-validated by the upstream parse regex (safeParse / safeVerify /
    // safeUnwrap), so every charCode is in [0, 255] and in the Crockford alphabet.
    // No per-char bounds guard is needed here — contrast decodeHex, which guards
    // `hiCode >= hexCharCodeToNibble.length` because it receives untrusted caller input.
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
