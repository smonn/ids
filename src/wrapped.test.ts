import { afterAll, beforeAll, describe, expect, expectTypeOf, it, vi } from "vitest";
import {
  createWrappedKeyId,
  decodeWrappingKey,
  encodeWrappingKey,
  importWrappingKey,
  type UnwrapResult,
  type WrappedKeyCodec,
} from "./wrapped.js";
import { getWrappingKeyMaterial, type WrappingKey } from "./wrapping-key.js";
import type { Id } from "./types.js";
import { toWireId } from "./wire/envelope.js";

const payloadByteLength = 16;
const tagByteLength = 8;
const zeroIv = new Uint8Array(payloadByteLength);

describe("wrapped", () => {
  let warnSilencer: ReturnType<typeof vi.spyOn>;
  beforeAll(() => {
    warnSilencer = vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterAll(() => {
    warnSilencer.mockRestore();
  });

  it("wrap and unwrap round-trip a u32 lookup key", async () => {
    const key = await importWrappingKey(new Uint8Array(32).fill(0x42));
    const inv = createWrappedKeyId("inv", { kind: "u32", keys: [key] });
    const id = await inv.wrap(42);
    await expect(inv.unwrap(id)).resolves.toBe(42);
  });

  it("safeUnwrap accepts untrusted input and returns canonical id with lookup key", async () => {
    const key = await importWrappingKey(new Uint8Array(32).fill(0x42));
    const inv = createWrappedKeyId("inv", { kind: "u32", keys: [key] });
    const id = await inv.wrap(99);
    const upper = id.toUpperCase() as typeof id;
    const result = await inv.safeUnwrap(upper);
    expect(result).toEqual({ ok: true, id, lookupKey: 99 });
  });

  it("safeUnwrap reports verification failure without throwing", async () => {
    const keyA = await importWrappingKey(new Uint8Array(32).fill(0xaa));
    const keyB = await importWrappingKey(new Uint8Array(32).fill(0xbb));
    const inv = createWrappedKeyId("inv", { kind: "u32", keys: [keyA] });
    const id = await inv.wrap(1);
    const other = createWrappedKeyId("inv", {
      kind: "u32",
      keys: [keyB],
      allowDuplicateBrand: true,
    });
    await expect(other.unwrap(id)).rejects.toThrow("verification failed");
    await expect(inv.safeUnwrap(id)).resolves.toEqual({ ok: true, id, lookupKey: 1 });
    const tampered = (id.slice(0, -1) + (id.endsWith("0") ? "1" : "0")) as typeof id;
    await expect(inv.safeUnwrap(tampered)).resolves.toEqual({
      ok: false,
      error: "verification_failed",
    });
  });

  it("rejects a verified u32 payload with a non-canonical lane", async () => {
    const key = await importWrappingKey(new Uint8Array(32).fill(0xaa));
    const inv = createWrappedKeyId("inv", { kind: "u32", keys: [key], allowDuplicateBrand: true });
    const id = await nonCanonicalU32Id("inv_", "inv", key);
    await expect(inv.safeUnwrap(id)).resolves.toEqual({
      ok: false,
      error: "verification_failed",
    });
  });

  it("safeUnwrap reports structural parse failure without verifying", async () => {
    const key = await importWrappingKey(new Uint8Array(32).fill(0xaa));
    const inv = createWrappedKeyId("inv", { kind: "u32", keys: [key], allowDuplicateBrand: true });
    await expect(inv.safeUnwrap("bad")).resolves.toEqual({
      ok: false,
      error: "invalid_prefix",
    });
  });

  it("unwrap tries every keyring entry until verification succeeds", async () => {
    const oldKey = await importWrappingKey(new Uint8Array(32).fill(0x01));
    const newKey = await importWrappingKey(new Uint8Array(32).fill(0x02));
    const legacy = createWrappedKeyId("inv", {
      kind: "u32",
      keys: [oldKey],
      allowDuplicateBrand: true,
    });
    const id = await legacy.wrap(7);
    const rotated = createWrappedKeyId("inv", {
      kind: "u32",
      keys: [newKey, oldKey],
      allowDuplicateBrand: true,
    });
    await expect(rotated.unwrap(id)).resolves.toBe(7);
    await expect(rotated.wrap(7)).not.toBe(id);
  });

  it("rejects duplicate wrapping keys in the keyring at construction", async () => {
    const key = await importWrappingKey(new Uint8Array(32).fill(0x42));
    expect(() => createWrappedKeyId("inv", { kind: "u32", keys: [key, key] })).toThrow(
      "duplicate wrapping key in keyring",
    );
  });

  it("accepts distinct wrapping keys with different byte lengths", async () => {
    const key128 = await importWrappingKey(new Uint8Array(16).fill(0x42));
    const key256 = await importWrappingKey(new Uint8Array(32).fill(0x42));
    expect(() =>
      createWrappedKeyId("inv", {
        kind: "u32",
        keys: [key128, key256],
        allowDuplicateBrand: true,
      }),
    ).not.toThrow();
  });

  it("rejects an empty keyring at construction", () => {
    expect(() =>
      createWrappedKeyId("inv", {
        kind: "u32",
        keys: [] as never,
        allowDuplicateBrand: true,
      }),
    ).toThrow("wrapped keyring must contain at least one key");
  });

  it("rejects unsupported wrapped key kinds at construction", async () => {
    const key = await importWrappingKey(new Uint8Array(32).fill(0x42));
    expect(() =>
      createWrappedKeyId("inv", {
        kind: "i32" as never,
        keys: [key],
        allowDuplicateBrand: true,
      }),
    ).toThrow("unsupported wrapped key kind: expected u32");
  });

  it("wrap rejects out-of-range u32 lookup keys", async () => {
    const key = await importWrappingKey(new Uint8Array(32).fill(0x42));
    const inv = createWrappedKeyId("inv", { kind: "u32", keys: [key], allowDuplicateBrand: true });
    await expect(inv.wrap(-1)).rejects.toThrow("invalid u32 lookup key");
    await expect(inv.wrap(0x1_0000_0000)).rejects.toThrow("invalid u32 lookup key");
    await expect(inv.wrap(1.5)).rejects.toThrow("invalid u32 lookup key");
  });

  it("parse and is validate wire form without operator key material", async () => {
    const key = await importWrappingKey(new Uint8Array(32).fill(0x42));
    const inv = createWrappedKeyId("inv", { kind: "u32", keys: [key], allowDuplicateBrand: true });
    const id = await inv.wrap(123);
    expect(inv.is(id)).toBe(true);
    expect(inv.parse(id.toUpperCase())).toBe(id);
    expect(inv.safeParse("bad")).toEqual({ ok: false, error: "invalid_prefix" });
  });

  it("the same lookup key under the same wrapping key yields the same public id", async () => {
    const key = await importWrappingKey(new Uint8Array(32).fill(0x42));
    const inv = createWrappedKeyId("inv", { kind: "u32", keys: [key], allowDuplicateBrand: true });
    await expect(inv.wrap(555)).resolves.toBe(await inv.wrap(555));
  });

  it.each([0, 0xffff_ffff])("wrap and unwrap u32 boundary lookupKey=%i", async (lookupKey) => {
    const key = await importWrappingKey(new Uint8Array(32).fill(0x42));
    const inv = createWrappedKeyId("inv", { kind: "u32", keys: [key], allowDuplicateBrand: true });
    const id = await inv.wrap(lookupKey);
    await expect(inv.unwrap(id)).resolves.toBe(lookupKey);
  });

  it("encodeWrappingKey and decodeWrappingKey round-trip raw operator bytes", () => {
    const bytes = new Uint8Array(32).fill(0xab);
    expect(decodeWrappingKey(encodeWrappingKey(bytes, "hex"), "hex")).toEqual(bytes);
    expect(decodeWrappingKey(encodeWrappingKey(bytes, "base64url"), "base64url")).toEqual(bytes);
  });

  it("wrapping key helpers reject invalid formats and key material", async () => {
    const unprintableFormat = {
      toString: () => {
        throw new Error("boom");
      },
    };
    expect(() => encodeWrappingKey(new Uint8Array(32), "pem" as never)).toThrow(
      "invalid wrapping key format",
    );
    expect(() => encodeWrappingKey(new Uint8Array(32), unprintableFormat as never)).toThrow(
      "invalid wrapping key format: expected hex or base64url, got '[unprintable]'",
    );
    expect(() => decodeWrappingKey("", "hex")).toThrow("invalid hex key");
    expect(() => decodeWrappingKey("abc", "hex")).toThrow("invalid hex key");
    expect(() => decodeWrappingKey("zz", "hex")).toThrow("invalid hex key");
    expect(() => decodeWrappingKey("?", "base64url")).toThrow("invalid base64url key");
    expect(() => decodeWrappingKey("aa", "base64url")).toThrow("invalid wrapping key length");
    await expect(importWrappingKey(new Uint8Array(15))).rejects.toThrow(
      "invalid wrapping key length",
    );
  });

  it("uses opaque wrapping key handles from importWrappingKey", async () => {
    const key = await importWrappingKey(new Uint8Array(32).fill(0x42));
    expect(Object.keys(key)).toEqual([]);
    expect(() =>
      createWrappedKeyId("inv", {
        kind: "u32",
        keys: [{} as never],
        allowDuplicateBrand: true,
      }),
    ).toThrow("invalid wrapping key");
  });

  it("toJsonSchema describes the canonical wire pattern", async () => {
    const key = await importWrappingKey(new Uint8Array(32).fill(0x42));
    const inv = createWrappedKeyId("inv", { kind: "u32", keys: [key], allowDuplicateBrand: true });
    const schema = inv.toJsonSchema();
    expect(schema.type).toBe("string");
    expect(schema.pattern).toContain("inv_");
    expect(inv.is(schema.example)).toBe(true);
  });

  it("types follow kind at the public boundary", () => {
    expectTypeOf(createWrappedKeyId).toBeCallableWith("inv", {
      kind: "u32",
      keys: [{} as never],
    });
    expectTypeOf({} as WrappedKeyCodec<"inv", "u32">).toMatchTypeOf<{
      wrap: (lookupKey: number) => Promise<Id<"inv">>;
      unwrap: (id: Id<"inv">) => Promise<number>;
      safeUnwrap: (input: unknown) => Promise<UnwrapResult<"inv", "u32">>;
    }>();
  });
});

async function nonCanonicalU32Id(
  prefix: "inv_",
  brand: "inv",
  key: WrappingKey,
): Promise<Id<"inv">> {
  const material = getWrappingKeyMaterial(key);
  const lane = new Uint8Array(tagByteLength);
  lane[0] = 1;
  lane[7] = 42;
  const tag = await hmacTag(material.hmacKey, brand, lane);
  const plaintext = new Uint8Array(payloadByteLength);
  plaintext.set(lane, 0);
  plaintext.set(tag, tagByteLength);
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-CBC", iv: zeroIv },
      material.aesKey,
      plaintext as Uint8Array<ArrayBuffer>,
    ),
  );
  return toWireId(prefix, encrypted.subarray(0, payloadByteLength));
}

async function hmacTag(hmacKey: CryptoKey, brand: "inv", lane: Uint8Array): Promise<Uint8Array> {
  const label = new TextEncoder().encode(`${brand}:u32:`);
  const message = new Uint8Array(label.length + lane.length);
  message.set(label, 0);
  message.set(lane, label.length);
  const signature = new Uint8Array(
    await crypto.subtle.sign("HMAC", hmacKey, message as Uint8Array<ArrayBuffer>),
  );
  return signature.subarray(0, tagByteLength);
}
