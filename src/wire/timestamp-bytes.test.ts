import { describe, expect, it } from "vitest";
import {
  writeTimestamp,
  readTimestampMs,
  readTimestampMsFromBase32Suffix,
} from "./timestamp-bytes.js";
import { encodeBase32 } from "./base32.js";
import { isIdsError } from "../error.js";

describe("writeTimestamp", () => {
  it("throws IdsError invalid_timestamp on a negative value", () => {
    let err: unknown;
    try {
      writeTimestamp(-1, new Uint8Array(6));
    } catch (e) {
      err = e;
    }
    expect(isIdsError(err) && err.code === "invalid_timestamp").toBe(true);
  });

  it("throws IdsError invalid_timestamp on a non-integer value", () => {
    let err: unknown;
    try {
      writeTimestamp(1.5, new Uint8Array(6));
    } catch (e) {
      err = e;
    }
    expect(isIdsError(err) && err.code === "invalid_timestamp").toBe(true);
  });

  it("throws IdsError invalid_timestamp when ms >= 2**48", () => {
    let err: unknown;
    try {
      writeTimestamp(2 ** 48, new Uint8Array(6));
    } catch (e) {
      err = e;
    }
    expect(isIdsError(err) && err.code === "invalid_timestamp").toBe(true);
  });

  it("accepts ms === 2**48 - 1 without throwing (upper boundary)", () => {
    expect(() => writeTimestamp(2 ** 48 - 1, new Uint8Array(6))).not.toThrow();
  });
});

describe("readTimestampMs", () => {
  it("round-trips a known timestamp", () => {
    const ms = 1704067200000; // 2024-01-01T00:00:00Z
    const buffer = new Uint8Array(6);
    writeTimestamp(ms, buffer);
    expect(readTimestampMs(buffer)).toBe(ms);
  });
});

describe("readTimestampMsFromBase32Suffix", () => {
  it("decodes the expected millisecond from a known base32-encoded ID suffix", () => {
    const ms = 1704067200000; // 2024-01-01T00:00:00Z
    const buffer = new Uint8Array(16);
    writeTimestamp(ms, buffer);
    const base32Suffix = encodeBase32(buffer);
    expect(readTimestampMsFromBase32Suffix(base32Suffix)).toBe(ms);
  });
});
