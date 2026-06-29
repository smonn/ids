import { describe, expect, it } from "vitest";
import {
  assertValidKeyMaterialByteLength,
  assertValidKeyring,
  decodeKeyMaterial,
} from "./key-material.js";

describe("key-material", () => {
  describe("assertValidKeyring", () => {
    it("throws duplicate_keyring_entry for a 3-key ring with duplicate at non-adjacent positions [0] and [2]", () => {
      const key0 = Symbol("k0");
      const key1 = Symbol("k1");
      expect(() => assertValidKeyring([key0, key1, key0], (a, b) => a === b, "test")).toThrow(
        expect.objectContaining({ code: "duplicate_keyring_entry" }),
      );
    });
  });

  describe("decodeKeyMaterial — hex encoding errors", () => {
    it("throws invalid_key_encoding for odd-length hex", () => {
      expect(() => decodeKeyMaterial("abc", "hex", "test", "test")).toThrow(
        expect.objectContaining({ code: "invalid_key_encoding" }),
      );
    });

    it("throws invalid_key_encoding for empty hex", () => {
      expect(() => decodeKeyMaterial("", "hex", "test", "test")).toThrow(
        expect.objectContaining({ code: "invalid_key_encoding" }),
      );
    });

    it("throws invalid_key_encoding for non-hex characters", () => {
      expect(() => decodeKeyMaterial("gg", "hex", "test", "test")).toThrow(
        expect.objectContaining({ code: "invalid_key_encoding" }),
      );
    });
  });

  describe("assertValidKeyMaterialByteLength", () => {
    it("throws invalid_key_length for 15-byte material", () => {
      expect(() => assertValidKeyMaterialByteLength(15, "test")).toThrow(
        expect.objectContaining({ code: "invalid_key_length" }),
      );
    });

    it("throws invalid_key_length for 17-byte material", () => {
      expect(() => assertValidKeyMaterialByteLength(17, "test")).toThrow(
        expect.objectContaining({ code: "invalid_key_length" }),
      );
    });
  });
});
