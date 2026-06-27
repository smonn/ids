import { describe, expect, it } from "vitest";
import * as fc from "fast-check";
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

  it("encodes empty input to empty string", () => {
    expect(encodeBase32(new Uint8Array(0))).toBe("");
  });

  it("encodes 5-byte input to exactly 8 characters", () => {
    expect(encodeBase32(new Uint8Array(5)).length).toBe(8);
  });

  it("encodes 10-byte input to exactly 16 characters", () => {
    expect(encodeBase32(new Uint8Array(10)).length).toBe(16);
  });

  it("round-trips a 16-byte buffer through encode then decode", () => {
    const buf = new Uint8Array([
      0xde, 0xad, 0xbe, 0xef, 0x00, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88, 0x99, 0xaa,
      0xbb,
    ]);
    expect(decodeBase32(encodeBase32(buf))).toEqual(buf);
  });

  it("round-trips arbitrary Uint8Array through encode then decode", () => {
    // Lengths include multiples of 5 (4, 5, 6, 9, 10, 11) to exercise the
    // partial-group accumulator path in both encodeBase32 and decodeBase32.
    const byteLengths = fc.oneof(
      fc.constantFrom(4, 5, 6, 9, 10, 11, 15, 16, 20),
      fc.integer({ min: 0, max: 32 }),
    );
    fc.assert(
      fc.property(
        byteLengths.chain((len) => fc.uint8Array({ minLength: len, maxLength: len })),
        (bytes) => {
          expect(decodeBase32(encodeBase32(bytes))).toEqual(bytes);
        },
      ),
    );
  });

  // Direct negative-input tests pin the trust-the-type contract (ADR-0003):
  // decodeBase32 never throws on invalid input — callers (safeParse / is() /
  // safeVerify / safeUnwrap) validate input before any string reaches the decoder.

  it("does not throw on an out-of-alphabet character and returns a Uint8Array of the expected length", () => {
    // '!' (ASCII 33) is not in the Crockford alphabet; charCodeToValue maps it
    // to INVALID (0xff). The 5-bit accumulator absorbs the sentinel and emits
    // garbage bytes — no throw, no error sentinel on output.
    const result = decodeBase32("!!!!!!!!!!!!!!!!!!!!!!!!!!");
    expect(result).toBeInstanceOf(Uint8Array);
    // Output length is Math.floor(26 * 5 / 8) = 16, same as for canonical input.
    expect(result.length).toBe(16);
  });

  it("does not resolve Crockford alias characters ('o', 'i', 'l') and produces different output than their canonical equivalents", () => {
    // Aliases are normalised by upstream safeParse() / parse(), NOT by decodeBase32;
    // is() rejects alias chars rather than normalising them.
    // The decoder maps 'o' / 'i' / 'l' to INVALID (0xff), producing garbage
    // bytes that differ from the output for their canonical equivalents.
    const decodedWithO = decodeBase32("oooooooooooooooooooooooooo");
    const decodedWith0 = decodeBase32("00000000000000000000000000");
    expect(decodedWithO).not.toEqual(decodedWith0);

    const decodedWithI = decodeBase32("iiiiiiiiiiiiiiiiiiiiiiiiii");
    const decodedWithL = decodeBase32("llllllllllllllllllllllllll");
    const decodedWith1 = decodeBase32("11111111111111111111111111");
    expect(decodedWithI).not.toEqual(decodedWith1);
    expect(decodedWithL).not.toEqual(decodedWith1);
  });

  it("does not throw on wrong-length input and returns a shorter buffer than the canonical 16 bytes", () => {
    // Math.floor(inputLength * 5 / 8) governs output length. A 10-char input
    // yields 6 bytes (not 16), pinning that wrong-length input silently produces
    // wrong-length output rather than throwing.
    const result = decodeBase32("0000000000");
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBe(6);
  });
});
