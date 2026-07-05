import { describe, expect, it } from "vitest";
import { isIdsError } from "../../error.js";
import {
  assertValidKeyMaterialByteLength,
  assertValidKeyring,
  createKeyHandleStore,
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

    it("throws invalid_key_length for empty hex (zero decoded bytes is invalid key length)", () => {
      expect(() => decodeKeyMaterial("", "hex", "test", "test")).toThrow(
        expect.objectContaining({ code: "invalid_key_length" }),
      );
    });

    it("throws invalid_key_encoding for non-hex characters", () => {
      expect(() => decodeKeyMaterial("gg", "hex", "test", "test")).toThrow(
        expect.objectContaining({ code: "invalid_key_encoding" }),
      );
    });

    it("attaches original decode error as cause for invalid hex", () => {
      let err: unknown;
      try {
        decodeKeyMaterial("gg", "hex", "test", "test");
      } catch (e) {
        err = e;
      }
      expect(isIdsError(err)).toBe(true);
      if (isIdsError(err)) {
        expect(err.cause).toBeInstanceOf(Error);
      }
    });

    it("attaches original decode error as cause for invalid base64url", () => {
      let err: unknown;
      try {
        decodeKeyMaterial("!!!", "base64url", "test", "test");
      } catch (e) {
        err = e;
      }
      expect(isIdsError(err)).toBe(true);
      if (isIdsError(err)) {
        expect(err.cause).toBeInstanceOf(Error);
      }
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

describe("createKeyHandleStore", () => {
  type FakeHandle = { readonly [sym: symbol]: "FakeHandle" };

  it("make() returns a frozen object handle", () => {
    const store = createKeyHandleStore<FakeHandle, { value: number }>("fake");
    const handle = store.make({ value: 42 });
    expect(Object.isFrozen(handle)).toBe(true);
  });

  it("get() retrieves the internals stored by make()", () => {
    const store = createKeyHandleStore<FakeHandle, { value: number }>("fake");
    const handle = store.make({ value: 99 });
    expect(store.get(handle).value).toBe(99);
  });

  it("two make() calls produce distinct handles", () => {
    const store = createKeyHandleStore<FakeHandle, { value: number }>("fake");
    const h1 = store.make({ value: 1 });
    const h2 = store.make({ value: 2 });
    expect(h1).not.toBe(h2);
    expect(store.get(h1).value).toBe(1);
    expect(store.get(h2).value).toBe(2);
  });

  it("get() throws a plain Error (not IdsError) for an unregistered handle", () => {
    const store = createKeyHandleStore<FakeHandle, { value: number }>("widget");
    const fake = Object.freeze({}) as unknown as FakeHandle;
    let err: unknown;
    try {
      store.get(fake);
    } catch (e) {
      err = e;
    }
    expect(err instanceof Error).toBe(true);
    expect(isIdsError(err)).toBe(false);
  });

  it("get() error message includes the noun passed to createKeyHandleStore", () => {
    const store = createKeyHandleStore<FakeHandle, { value: number }>("widget");
    const fake = Object.freeze({}) as unknown as FakeHandle;
    let err: unknown;
    try {
      store.get(fake);
    } catch (e) {
      err = e;
    }
    expect((err as Error).message).toContain("widget");
  });

  it("stores internals separately per store instance (two stores, same handle shape)", () => {
    const storeA = createKeyHandleStore<FakeHandle, { src: "A" }>("a");
    const storeB = createKeyHandleStore<FakeHandle, { src: "B" }>("b");
    const hA = storeA.make({ src: "A" });
    const hB = storeB.make({ src: "B" });
    expect(storeA.get(hA).src).toBe("A");
    expect(storeB.get(hB).src).toBe("B");
    // hA is not in storeB
    let err: unknown;
    try {
      storeB.get(hA as unknown as FakeHandle);
    } catch (e) {
      err = e;
    }
    expect(err instanceof Error).toBe(true);
  });
});
