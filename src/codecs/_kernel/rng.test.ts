import { describe, it, expect } from "vitest";
import { harvestUUIDBytes } from "./rng.js";

describe("harvestUUIDBytes", () => {
  it("maps '00112233-4455-4677-8899-aabbccddeeff' to the expected byte sequence", () => {
    // Exercises both for-loops in hexCharCodeToNibble initialization:
    //   digit nibbles '0'–'5' at string offsets 0–7, 9–12  → bytes 0x00–0x55
    //   letter nibbles 'a'–'d' at string offsets 24–31     → bytes 0xaa–0xdd
    const target = new Uint8Array(10);
    harvestUUIDBytes("00112233-4455-4677-8899-aabbccddeeff", target);
    expect(Array.from(target)).toEqual([
      0x00, 0x11, 0x22, 0x33, 0x44, 0x55, 0xaa, 0xbb, 0xcc, 0xdd,
    ]);
  });

  it("reads string offsets 0–7 into bytes 0–3", () => {
    const target = new Uint8Array(10);
    harvestUUIDBytes("12345678-0000-4000-0000-000000000000", target);
    expect(target[0]).toBe(0x12);
    expect(target[1]).toBe(0x34);
    expect(target[2]).toBe(0x56);
    expect(target[3]).toBe(0x78);
  });

  it("reads string offsets 9–12 into bytes 4–5", () => {
    const target = new Uint8Array(10);
    harvestUUIDBytes("00000000-abcd-4000-0000-000000000000", target);
    expect(target[4]).toBe(0xab);
    expect(target[5]).toBe(0xcd);
  });

  it("reads string offsets 24–31 into bytes 6–9", () => {
    const target = new Uint8Array(10);
    harvestUUIDBytes("00000000-0000-4000-0000-aabbccdd0000", target);
    expect(target[6]).toBe(0xaa);
    expect(target[7]).toBe(0xbb);
    expect(target[8]).toBe(0xcc);
    expect(target[9]).toBe(0xdd);
  });
});
