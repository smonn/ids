import { describe, expect, it } from "vitest";
import * as fc from "fast-check";
import { toUUID, fromUUID, safeFromUUID } from "./uuid.js";
import { toWireId, payloadBytesFromId } from "./envelope.js";
import { IdsError, isIdsError } from "../error.js";
import type { ParseError } from "../types.js";

// Fixed prefix used throughout this file.
const PREFIX = "usr_" as const;

// A known 16-byte sequence expressed as a lowercase UUID.
// Bytes: 01 23 45 67 89 ab cd ef 01 23 45 67 89 ab cd ef
const KNOWN_UUID = "01234567-89ab-cdef-0123-456789abcdef";
const KNOWN_BYTES = new Uint8Array([
  0x01, 0x23, 0x45, 0x67, 0x89, 0xab, 0xcd, 0xef, 0x01, 0x23, 0x45, 0x67, 0x89, 0xab, 0xcd, 0xef,
]);

describe("toUUID", () => {
  it("returns a lowercase hyphenated 8-4-4-4-12 UUID string", () => {
    const id = toWireId(PREFIX, KNOWN_BYTES);
    expect(toUUID(PREFIX, id)).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it("returns a plain string (not a branded type)", () => {
    const id = toWireId(PREFIX, KNOWN_BYTES);
    expect(typeof toUUID(PREFIX, id)).toBe("string");
  });

  it("produces 36-character strings (32 hex + 4 hyphens)", () => {
    const id = toWireId(PREFIX, KNOWN_BYTES);
    expect(toUUID(PREFIX, id)).toHaveLength(36);
  });

  it("hyphens appear at positions 8, 13, 18, 23", () => {
    const id = toWireId(PREFIX, KNOWN_BYTES);
    const uuid = toUUID(PREFIX, id);
    expect(uuid[8]).toBe("-");
    expect(uuid[13]).toBe("-");
    expect(uuid[18]).toBe("-");
    expect(uuid[23]).toBe("-");
  });

  it("encodes a known payload to the expected UUID", () => {
    const id = toWireId(PREFIX, KNOWN_BYTES);
    expect(toUUID(PREFIX, id)).toBe(KNOWN_UUID);
  });

  it("encodes all-zero payload as the all-zero UUID", () => {
    const id = toWireId(PREFIX, new Uint8Array(16));
    expect(toUUID(PREFIX, id)).toBe("00000000-0000-0000-0000-000000000000");
  });

  it("encodes all-0xff payload as 'ffffffff-ffff-ffff-ffff-ffffffffffff'", () => {
    const id = toWireId(PREFIX, new Uint8Array(16).fill(0xff));
    expect(toUUID(PREFIX, id)).toBe("ffffffff-ffff-ffff-ffff-ffffffffffff");
  });

  it("property: encodes arbitrary 16-byte payloads to valid UUID format", () => {
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 16, maxLength: 16 }), (bytes) => {
        const id = toWireId(PREFIX, bytes);
        return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
          toUUID(PREFIX, id),
        );
      }),
    );
  });
});

describe("safeFromUUID", () => {
  it("returns { ok: false, error: 'not_string' } for null", () => {
    expect(safeFromUUID(PREFIX, null)).toEqual({ ok: false, error: "not_string" });
  });

  it("returns { ok: false, error: 'not_string' } for a number", () => {
    expect(safeFromUUID(PREFIX, 42)).toEqual({ ok: false, error: "not_string" });
  });

  it("returns { ok: false, error: 'not_string' } for undefined", () => {
    expect(safeFromUUID(PREFIX, undefined)).toEqual({ ok: false, error: "not_string" });
  });

  it("returns { ok: false, error: 'not_string' } for an object", () => {
    expect(safeFromUUID(PREFIX, {})).toEqual({ ok: false, error: "not_string" });
  });

  it("returns { ok: false, error: 'invalid_uuid' } for a hyphenless 32-char form", () => {
    expect(safeFromUUID(PREFIX, "01234567890123456789012345678901")).toEqual({
      ok: false,
      error: "invalid_uuid",
    });
  });

  it("returns { ok: false, error: 'invalid_uuid' } for brace-wrapped UUID", () => {
    expect(safeFromUUID(PREFIX, "{01234567-89ab-cdef-0123-456789abcdef}")).toEqual({
      ok: false,
      error: "invalid_uuid",
    });
  });

  it("returns { ok: false, error: 'invalid_uuid' } for urn:uuid: prefix", () => {
    expect(safeFromUUID(PREFIX, "urn:uuid:01234567-89ab-cdef-0123-456789abcdef")).toEqual({
      ok: false,
      error: "invalid_uuid",
    });
  });

  it("returns { ok: false, error: 'invalid_uuid' } for wrong grouping (9-3-4-4-12)", () => {
    expect(safeFromUUID(PREFIX, "012345678-9ab-cdef-0123-456789abcdef")).toEqual({
      ok: false,
      error: "invalid_uuid",
    });
  });

  it("returns { ok: false, error: 'invalid_uuid' } for too short (35 chars)", () => {
    expect(safeFromUUID(PREFIX, "01234567-89ab-cdef-0123-456789abcde")).toEqual({
      ok: false,
      error: "invalid_uuid",
    });
  });

  it("returns { ok: false, error: 'invalid_uuid' } for too long (37 chars)", () => {
    expect(safeFromUUID(PREFIX, "01234567-89ab-cdef-0123-456789abcdefa")).toEqual({
      ok: false,
      error: "invalid_uuid",
    });
  });

  it("returns { ok: false, error: 'invalid_uuid' } for non-hex characters", () => {
    expect(safeFromUUID(PREFIX, "01234567-89ab-cdef-0123-456789abcdgg")).toEqual({
      ok: false,
      error: "invalid_uuid",
    });
  });

  it("returns { ok: false, error: 'invalid_uuid' } for an empty string", () => {
    expect(safeFromUUID(PREFIX, "")).toEqual({ ok: false, error: "invalid_uuid" });
  });

  it("returns { ok: true, id } for valid lowercase UUID", () => {
    expect(safeFromUUID(PREFIX, KNOWN_UUID).ok).toBe(true);
  });

  it("returns { ok: true, id } for valid uppercase UUID", () => {
    expect(safeFromUUID(PREFIX, KNOWN_UUID.toUpperCase()).ok).toBe(true);
  });

  it("returns { ok: true, id } for mixed-case UUID", () => {
    expect(safeFromUUID(PREFIX, "01234567-89AB-CDEF-0123-456789abcdef").ok).toBe(true);
  });

  it("success result is a valid wire ID (starts with prefix and has 26 base32 chars)", () => {
    const result = safeFromUUID(PREFIX, KNOWN_UUID);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.id.startsWith(PREFIX)).toBe(true);
      expect(result.id.slice(PREFIX.length)).toHaveLength(26);
    }
  });

  it("uppercase and lowercase UUIDs decode to the same id", () => {
    const lower = safeFromUUID(PREFIX, KNOWN_UUID);
    const upper = safeFromUUID(PREFIX, KNOWN_UUID.toUpperCase());
    expect(lower).toEqual(upper);
  });

  it("decodes the known UUID to the expected payload bytes", () => {
    const result = safeFromUUID(PREFIX, KNOWN_UUID);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Array.from(payloadBytesFromId(PREFIX, result.id))).toEqual(Array.from(KNOWN_BYTES));
    }
  });

  it("property: any 128-bit UUID produces a valid wire ID", () => {
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 16, maxLength: 16 }), (bytes) => {
        const hex = Array.from(bytes)
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
        const uuid = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
        const result = safeFromUUID(PREFIX, uuid);
        if (!result.ok) return false;
        // Result must start with prefix and have canonical length.
        return result.id.startsWith(PREFIX) && result.id.length === PREFIX.length + 26;
      }),
    );
  });
});

describe("fromUUID", () => {
  it("returns the id for a valid UUID", () => {
    const id = fromUUID(PREFIX, KNOWN_UUID);
    expect(id.startsWith(PREFIX)).toBe(true);
  });

  it("throws IdsError with code 'invalid_id' for a malformed UUID", () => {
    let err: unknown;
    try {
      fromUUID(PREFIX, "not-a-uuid");
    } catch (e) {
      err = e;
    }
    expect(isIdsError(err)).toBe(true);
    expect((err as IdsError).code).toBe("invalid_id");
  });

  it("cause is 'invalid_uuid' for malformed UUID syntax", () => {
    let err: unknown;
    try {
      fromUUID(PREFIX, "not-a-uuid");
    } catch (e) {
      err = e;
    }
    expect((err as IdsError).cause).toBe("invalid_uuid" satisfies ParseError);
  });

  it("cause is 'invalid_uuid' for a hyphenless 32-char form", () => {
    let err: unknown;
    try {
      fromUUID(PREFIX, "01234567890123456789012345678901");
    } catch (e) {
      err = e;
    }
    expect(isIdsError(err)).toBe(true);
    expect((err as IdsError).cause).toBe("invalid_uuid");
  });
});

describe("round-trip bijections", () => {
  it("fromUUID(toUUID(id)) === id for any 16-byte wire ID", () => {
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 16, maxLength: 16 }), (bytes) => {
        const id = toWireId(PREFIX, bytes);
        return fromUUID(PREFIX, toUUID(PREFIX, id)) === id;
      }),
    );
  });

  it("toUUID(fromUUID(u)) === u for any lowercase 128-bit UUID", () => {
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 16, maxLength: 16 }), (bytes) => {
        const hex = Array.from(bytes)
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
        const uuid = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
        return toUUID(PREFIX, fromUUID(PREFIX, uuid)) === uuid;
      }),
    );
  });

  it("toUUID and fromUUID are inverses for the known bytes/UUID pair", () => {
    const id = toWireId(PREFIX, KNOWN_BYTES);
    expect(toUUID(PREFIX, id)).toBe(KNOWN_UUID);
    expect(fromUUID(PREFIX, KNOWN_UUID)).toBe(id);
  });

  it("the all-zero payload round-trips through the all-zero UUID", () => {
    const zeroBytes = new Uint8Array(16);
    const zeroUuid = "00000000-0000-0000-0000-000000000000";
    const id = toWireId(PREFIX, zeroBytes);
    expect(toUUID(PREFIX, id)).toBe(zeroUuid);
    expect(fromUUID(PREFIX, zeroUuid)).toBe(id);
  });

  it("a UUIDv7's leading 6 bytes (timestamp) are preserved after fromUUID", () => {
    // UUIDv7 stores a 48-bit ms timestamp in bytes 0-5 (big-endian).
    // Our raw mapping preserves all 16 bytes verbatim, so the first 6 bytes
    // of the resulting Id's payload are identical to the first 6 UUID bytes.
    //
    // UUID "0191d22c-9a40-7000-8000-000000000000":
    //   group1 = 0191d22c  → bytes 0-3: 01 91 d2 2c
    //   group2 = 9a40      → bytes 4-5: 9a 40
    const uuid = "0191d22c-9a40-7000-8000-000000000000";
    const expectedFirstSixBytes = [0x01, 0x91, 0xd2, 0x2c, 0x9a, 0x40];
    const id = fromUUID(PREFIX, uuid);
    const payload = payloadBytesFromId(PREFIX, id);
    for (let i = 0; i < 6; i++) {
      expect(payload[i]).toBe(expectedFirstSixBytes[i]);
    }
  });
});
