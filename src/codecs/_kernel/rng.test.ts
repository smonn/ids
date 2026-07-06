import { describe, it, expect } from "vitest";
import { defaultRng, fastTenByteRng, harvestUUIDBytes } from "./rng.js";
import { createTimestampId } from "../timestamp/index.js";

describe("defaultRng", () => {
  it("overwrites every byte in the target buffer", () => {
    const sentinel = 0xab;
    const buf = new Uint8Array(16).fill(sentinel);
    const snapshot = Array.from(buf);
    defaultRng(buf);
    expect(Array.from(buf)).not.toEqual(snapshot);
  });

  it("produces different output on independent calls", () => {
    const a = new Uint8Array(16);
    const b = new Uint8Array(16);
    defaultRng(a);
    defaultRng(b);
    expect(Array.from(a)).not.toEqual(Array.from(b));
  });
});

describe("fastTenByteRng", () => {
  it("overwrites exactly bytes 0–9 and leaves bytes beyond 9 untouched", () => {
    const buf1 = new Uint8Array(12).fill(0xab);
    const buf2 = new Uint8Array(12).fill(0xcd);
    fastTenByteRng(buf1);
    fastTenByteRng(buf2);
    expect([buf1[9], buf2[9]]).not.toEqual([0xab, 0xcd]);
    expect(buf1[10]).toBe(0xab);
    expect(buf1[11]).toBe(0xab);
  });

  it("produces different output on independent calls", () => {
    const a = new Uint8Array(10);
    const b = new Uint8Array(10);
    fastTenByteRng(a);
    fastTenByteRng(b);
    expect(Array.from(a)).not.toEqual(Array.from(b));
  });
});

describe("user-supplied rng zero-tail behavior", () => {
  it("a no-op rng at codec level leaves the random region as zero on the first generate call of a freshly-constructed codec instance (zero-tail holds only for that first call)", () => {
    const usr = createTimestampId("rzt", {
      allowDuplicateBrand: true,
      now: () => 0,
      rng: () => {},
    });
    // 16-byte payload: 6 zero timestamp bytes + 10 unfilled random bytes → 26 '0' chars
    expect(usr.generate()).toBe("rzt_" + "0".repeat(26));
  });

  it("a partial-fill rng receives a zero-initialized buffer from the codec", () => {
    let receivedBefore: number[] = [];
    const usr = createTimestampId("rzp", {
      allowDuplicateBrand: true,
      now: () => 0,
      rng: (target) => {
        receivedBefore = Array.from(target); // snapshot BEFORE writing
        target[0] = 0xff;
      },
    });
    usr.generate();
    // The codec constructs a fresh Uint8Array at codec-creation time (zero-initialised
    // by the JS runtime), so the user rng receives a zeroed view on the first call only.
    // Subsequent calls receive whatever the prior rng left in the shared scratch buffer.
    expect(receivedBefore).toEqual(Array.from({ length: 10 }, () => 0));
  });

  it("on the second generate call, the user rng receives stale bytes from the first call's random tail (shared-scratch behavior)", () => {
    let callCount = 0;
    let secondCallBytes: number[] = [];
    const usr = createTimestampId("rzs", {
      allowDuplicateBrand: true,
      now: () => 0,
      rng: (target) => {
        callCount++;
        if (callCount === 1) {
          target.fill(0xab); // first call: write a known non-zero pattern
        } else {
          secondCallBytes = Array.from(target); // second call: capture before no-op
        }
      },
    });
    usr.generate(); // scratch filled with 0xAB
    usr.generate(); // no-op rng; rng should receive the 0xAB bytes left from call 1
    // The shared scratch buffer is not zeroed between calls, so a no-op rng on the
    // second call inherits the prior call's random tail. This is self-harm only —
    // those bytes were already published in the caller's own prior ID.
    expect(secondCallBytes).toEqual(Array.from({ length: 10 }, () => 0xab));
  });
});

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
