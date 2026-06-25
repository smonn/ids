import { describe, expect, it } from "vitest";
import { decodeBase32, encodeBase32 } from "./base32.js";

describe("base32", () => {
  // Pins the L36 threshold: bits >= 5 in encodeBase32.
  // After processing byte 4 of a 16-byte input, the accumulator holds exactly
  // 5 bits; the while-loop must fire once more to emit the char. A bits > 5
  // mutant silently defers this emission, shifting all subsequent chars.
  it("encodes all-0xff to canonical Crockford string", () => {
    const buf = new Uint8Array(16).fill(0xff);
    expect(encodeBase32(buf)).toBe("zzzzzzzzzzzzzzzzzzzzzzzzzw");
  });

  // Pins the L55 threshold: bits >= 8 in decodeBase32.
  // After accumulating the 8th char (5 bits each → bits reaches exactly 8),
  // a byte must be emitted. A bits > 8 mutant skips this, producing a shorter
  // result with wrong byte values.
  it("decodes all-z+w back to all-0xff", () => {
    const expected = new Uint8Array(16).fill(0xff);
    expect(decodeBase32("zzzzzzzzzzzzzzzzzzzzzzzzzw")).toEqual(expected);
  });

  it("encodes incrementing bytes 0x00–0x0f to canonical Crockford string", () => {
    const buf = new Uint8Array(16).map((_, i) => i);
    expect(encodeBase32(buf)).toBe("000g40r40m30e209185gr38e1w");
  });

  it("decodes incrementing Crockford string back to 0x00–0x0f", () => {
    const expected = new Uint8Array(16).map((_, i) => i);
    expect(decodeBase32("000g40r40m30e209185gr38e1w")).toEqual(expected);
  });

  it("round-trips a 16-byte buffer through encode then decode", () => {
    const buf = new Uint8Array([
      0xde, 0xad, 0xbe, 0xef, 0x00, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88, 0x99, 0xaa,
      0xbb,
    ]);
    expect(decodeBase32(encodeBase32(buf))).toEqual(buf);
  });
});
