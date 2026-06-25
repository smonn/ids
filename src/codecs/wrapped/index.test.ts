import type { webcrypto } from "node:crypto";
import { afterAll, beforeAll, describe, expect, expectTypeOf, it, vi } from "vitest";
import * as fc from "fast-check";
import {
  createWrappedKeyId,
  decodeWrappingKey,
  encodeWrappingKey,
  IdsError,
  importWrappingKey,
  isIdsError,
  type UnwrapResult,
  type WrappedKeyCodec,
  type WrappingKeyFormat,
} from "./index.js";
import { getWrappingKeyMaterial, type WrappingKey } from "./key.js";
import type { Id } from "../../types.js";
import { payloadBytesFromId, toWireId } from "../../wire/envelope.js";

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
    await expect(other.unwrap(id)).rejects.toMatchObject({ code: "verification_failed" });
    await expect(inv.safeUnwrap(id)).resolves.toEqual({ ok: true, id, lookupKey: 1 });
    const tampered = (id.slice(0, -1) + (id.endsWith("0") ? "1" : "0")) as typeof id;
    await expect(inv.safeUnwrap(tampered)).resolves.toEqual({
      ok: false,
      error: "verification_failed",
    });
  });

  it("safeUnwrap never throws on 100 random canonical ids (decrypt-never-throws invariant)", async () => {
    const key = await importWrappingKey(new Uint8Array(32).fill(0x42));
    const inv = createWrappedKeyId("inv", { kind: "u32", keys: [key], allowDuplicateBrand: true });
    for (let i = 0; i < 100; i++) {
      const payload = crypto.getRandomValues(new Uint8Array(16));
      const id = toWireId("inv_", payload);
      const result = await inv.safeUnwrap(id);
      expect(result).toMatchObject({ ok: false, error: "verification_failed" });
    }
  });

  it("safeUnwrap rejects tokens wrapped for a different integer kind", async () => {
    const key = await importWrappingKey(new Uint8Array(32).fill(0xaa));
    const u32 = createWrappedKeyId("inv", { kind: "u32", keys: [key], allowDuplicateBrand: true });
    const i32 = createWrappedKeyId("inv", { kind: "i32", keys: [key], allowDuplicateBrand: true });
    const u64 = createWrappedKeyId("inv", { kind: "u64", keys: [key], allowDuplicateBrand: true });
    const i64 = createWrappedKeyId("inv", { kind: "i64", keys: [key], allowDuplicateBrand: true });
    const codecs = { u32, i32, u64, i64 };
    const sources = [
      { kind: "u32" as const, wrap: () => u32.wrap(42) },
      { kind: "i32" as const, wrap: () => i32.wrap(42) },
      { kind: "u64" as const, wrap: () => u64.wrap(42n) },
      { kind: "i64" as const, wrap: () => i64.wrap(42n) },
    ];

    for (const source of sources) {
      const id = await source.wrap();
      for (const target of sources) {
        if (source.kind === target.kind) continue;
        await expect(codecs[target.kind].safeUnwrap(id)).resolves.toEqual({
          ok: false,
          error: "verification_failed",
        });
      }
    }

    await expect(u32.safeUnwrap(await i32.wrap(-1))).resolves.toEqual({
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

  it("rejects a verified i32 payload with a non-canonical lane", async () => {
    const key = await importWrappingKey(new Uint8Array(32).fill(0xaa));
    const inv = createWrappedKeyId("inv", { kind: "i32", keys: [key], allowDuplicateBrand: true });
    const id = await nonCanonicalI32Id("inv_", "inv", key);
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

  it("safeUnwrap rejects wire input with wrong payload length before reaching AES decrypt", async () => {
    const key = await importWrappingKey(new Uint8Array(32).fill(0xaa));
    const inv = createWrappedKeyId("inv", { kind: "u32", keys: [key], allowDuplicateBrand: true });
    // Correct prefix, too-short payload (10 chars instead of 26)
    await expect(inv.safeUnwrap("inv_0000000000")).resolves.toEqual({
      ok: false,
      error: "invalid_base32",
    });
    // Correct prefix, too-long payload (30 chars instead of 26)
    await expect(inv.safeUnwrap("inv_" + "0".repeat(30))).resolves.toEqual({
      ok: false,
      error: "invalid_base32",
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
    const newKeyOnlyCodec = createWrappedKeyId("inv", {
      kind: "u32",
      keys: [newKey],
      allowDuplicateBrand: true,
    });
    expect(await rotated.wrap(7)).not.toBe(id);
    expect(await rotated.wrap(7)).toBe(await newKeyOnlyCodec.wrap(7));
  });

  it("safeUnwrap returns verification_failed when no keyring entry verifies (full-ring exhaustion)", async () => {
    const keyA = await importWrappingKey(new Uint8Array(32).fill(0xaa));
    const keyB = await importWrappingKey(new Uint8Array(32).fill(0xbb));
    const keyC = await importWrappingKey(new Uint8Array(32).fill(0xcc));
    const ring = createWrappedKeyId("inv", {
      kind: "u32",
      keys: [keyA, keyB],
      allowDuplicateBrand: true,
    });
    const outsider = createWrappedKeyId("inv", {
      kind: "u32",
      keys: [keyC],
      allowDuplicateBrand: true,
    });
    const id = await outsider.wrap(7);
    await expect(ring.safeUnwrap(id)).resolves.toEqual({ ok: false, error: "verification_failed" });
    await expect(ring.unwrap(id)).rejects.toMatchObject({ code: "verification_failed" });
  });

  it("rejects duplicate wrapping keys in the keyring at construction", async () => {
    const key = await importWrappingKey(new Uint8Array(32).fill(0x42));
    let err: unknown;
    try {
      createWrappedKeyId("inv", { kind: "u32", keys: [key, key] });
    } catch (e) {
      err = e;
    }
    expect(isIdsError(err)).toBe(true);
    expect((err as IdsError).code).toBe("duplicate_keyring_entry");
  });

  it("rejects two distinct wrapping key handles imported from the same raw bytes", async () => {
    const bytes = new Uint8Array(32).fill(0x42);
    const handle1 = await importWrappingKey(bytes);
    const handle2 = await importWrappingKey(bytes);
    expect(handle1).not.toBe(handle2);
    let err: unknown;
    try {
      createWrappedKeyId("inv", {
        kind: "u32",
        keys: [handle1, handle2],
        allowDuplicateBrand: true,
      });
    } catch (e) {
      err = e;
    }
    expect(isIdsError(err)).toBe(true);
    expect((err as IdsError).code).toBe("duplicate_keyring_entry");
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
    let err: unknown;
    try {
      createWrappedKeyId("inv", { kind: "u32", keys: [] as never, allowDuplicateBrand: true });
    } catch (e) {
      err = e;
    }
    expect(isIdsError(err)).toBe(true);
    expect((err as IdsError).code).toBe("empty_keyring");
  });

  it("rejects unsupported wrapped key kinds at construction", async () => {
    const key = await importWrappingKey(new Uint8Array(32).fill(0x42));
    let err: unknown;
    try {
      createWrappedKeyId("inv", { kind: "u128" as never, keys: [key], allowDuplicateBrand: true });
    } catch (e) {
      err = e;
    }
    expect(isIdsError(err)).toBe(true);
    expect((err as IdsError).code).toBe("invalid_kind");
  });

  it("wrap rejects out-of-range u32 lookup keys", async () => {
    const key = await importWrappingKey(new Uint8Array(32).fill(0x42));
    const inv = createWrappedKeyId("inv", { kind: "u32", keys: [key], allowDuplicateBrand: true });
    await expect(inv.wrap(-1)).rejects.toMatchObject({ code: "invalid_lookup_key" });
    await expect(inv.wrap(0x1_0000_0000)).rejects.toMatchObject({ code: "invalid_lookup_key" });
    await expect(inv.wrap(1.5)).rejects.toMatchObject({ code: "invalid_lookup_key" });
    await expect(inv.wrap(-0)).rejects.toMatchObject({ code: "invalid_lookup_key" });
    await expect(inv.wrap(42n as never)).rejects.toMatchObject({ code: "invalid_lookup_key" });
  });

  it("wrap rejects out-of-range i32 lookup keys", async () => {
    const key = await importWrappingKey(new Uint8Array(32).fill(0x42));
    const inv = createWrappedKeyId("inv", { kind: "i32", keys: [key], allowDuplicateBrand: true });
    await expect(inv.wrap(-0x8000_0001)).rejects.toMatchObject({ code: "invalid_lookup_key" });
    await expect(inv.wrap(0x8000_0000)).rejects.toMatchObject({ code: "invalid_lookup_key" });
    await expect(inv.wrap(1.5)).rejects.toMatchObject({ code: "invalid_lookup_key" });
    await expect(inv.wrap(-0)).rejects.toMatchObject({ code: "invalid_lookup_key" });
    await expect(inv.wrap(42n as never)).rejects.toMatchObject({ code: "invalid_lookup_key" });
  });

  it("wrap rejects out-of-range u64 lookup keys", async () => {
    const key = await importWrappingKey(new Uint8Array(32).fill(0x42));
    const inv = createWrappedKeyId("inv", { kind: "u64", keys: [key], allowDuplicateBrand: true });
    await expect(inv.wrap(-1n)).rejects.toMatchObject({ code: "invalid_lookup_key" });
    await expect(inv.wrap(0x1_0000_0000_0000_0000n)).rejects.toMatchObject({
      code: "invalid_lookup_key",
    });
    await expect(inv.wrap(42 as never)).rejects.toMatchObject({ code: "invalid_lookup_key" });
  });

  it("wrap rejects out-of-range i64 lookup keys", async () => {
    const key = await importWrappingKey(new Uint8Array(32).fill(0x42));
    const inv = createWrappedKeyId("inv", { kind: "i64", keys: [key], allowDuplicateBrand: true });
    await expect(inv.wrap(-(1n << 63n) - 1n)).rejects.toMatchObject({ code: "invalid_lookup_key" });
    await expect(inv.wrap(1n << 63n)).rejects.toMatchObject({ code: "invalid_lookup_key" });
    await expect(inv.wrap(42 as never)).rejects.toMatchObject({ code: "invalid_lookup_key" });
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

  it.each([-0x8000_0000, 0x7fff_ffff])(
    "wrap and unwrap i32 boundary lookupKey=%i",
    async (lookupKey) => {
      const key = await importWrappingKey(new Uint8Array(32).fill(0x42));
      const inv = createWrappedKeyId("inv", {
        kind: "i32",
        keys: [key],
        allowDuplicateBrand: true,
      });
      const id = await inv.wrap(lookupKey);
      await expect(inv.unwrap(id)).resolves.toBe(lookupKey);
    },
  );

  it.each([0n, 0xffff_ffff_ffff_ffffn])(
    "wrap and unwrap u64 boundary lookupKey=%s",
    async (lookupKey) => {
      const key = await importWrappingKey(new Uint8Array(32).fill(0x42));
      const inv = createWrappedKeyId("inv", {
        kind: "u64",
        keys: [key],
        allowDuplicateBrand: true,
      });
      const id = await inv.wrap(lookupKey);
      await expect(inv.unwrap(id)).resolves.toBe(lookupKey);
    },
  );

  it.each([-(1n << 63n), (1n << 63n) - 1n])(
    "wrap and unwrap i64 boundary lookupKey=%s",
    async (lookupKey) => {
      const key = await importWrappingKey(new Uint8Array(32).fill(0x42));
      const inv = createWrappedKeyId("inv", {
        kind: "i64",
        keys: [key],
        allowDuplicateBrand: true,
      });
      const id = await inv.wrap(lookupKey);
      await expect(inv.unwrap(id)).resolves.toBe(lookupKey);
    },
  );

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
    let err: unknown;
    try {
      encodeWrappingKey(new Uint8Array(32), "pem" as never);
    } catch (e) {
      err = e;
    }
    expect(isIdsError(err)).toBe(true);
    expect((err as IdsError).code).toBe("invalid_key_format");

    err = undefined;
    try {
      encodeWrappingKey(new Uint8Array(32), unprintableFormat as never);
    } catch (e) {
      err = e;
    }
    expect(isIdsError(err)).toBe(true);
    expect((err as IdsError).code).toBe("invalid_key_format");

    err = undefined;
    try {
      decodeWrappingKey("", "hex");
    } catch (e) {
      err = e;
    }
    expect(isIdsError(err)).toBe(true);
    expect((err as IdsError).code).toBe("invalid_key_encoding");

    err = undefined;
    try {
      decodeWrappingKey("abc", "hex");
    } catch (e) {
      err = e;
    }
    expect(isIdsError(err)).toBe(true);
    expect((err as IdsError).code).toBe("invalid_key_encoding");

    err = undefined;
    try {
      decodeWrappingKey("zz", "hex");
    } catch (e) {
      err = e;
    }
    expect(isIdsError(err)).toBe(true);
    expect((err as IdsError).code).toBe("invalid_key_encoding");

    err = undefined;
    try {
      decodeWrappingKey("?", "base64url");
    } catch (e) {
      err = e;
    }
    expect(isIdsError(err)).toBe(true);
    expect((err as IdsError).code).toBe("invalid_key_encoding");

    err = undefined;
    try {
      decodeWrappingKey("aa", "base64url");
    } catch (e) {
      err = e;
    }
    expect(isIdsError(err)).toBe(true);
    expect((err as IdsError).code).toBe("invalid_key_length");

    await expect(importWrappingKey(new Uint8Array(15))).rejects.toMatchObject({
      code: "invalid_key_length",
    });
  });

  it("uses opaque wrapping key handles from importWrappingKey", async () => {
    const key = await importWrappingKey(new Uint8Array(32).fill(0x42));
    expect(Object.keys(key)).toEqual([]);
    let err: unknown;
    try {
      createWrappedKeyId("inv", { kind: "u32", keys: [{} as never], allowDuplicateBrand: true });
    } catch (e) {
      err = e;
    }
    // WeakMap handle-not-found is an internal invariant guard — stays plain Error
    expect(err instanceof Error).toBe(true);
    expect(isIdsError(err)).toBe(false);
  });

  it("unwrap throws IdsError with code verification_failed on tag mismatch", async () => {
    const keyA = await importWrappingKey(new Uint8Array(32).fill(0xaa));
    const keyB = await importWrappingKey(new Uint8Array(32).fill(0xbb));
    const inv = createWrappedKeyId("inv", { kind: "u32", keys: [keyA], allowDuplicateBrand: true });
    const other = createWrappedKeyId("inv", {
      kind: "u32",
      keys: [keyB],
      allowDuplicateBrand: true,
    });
    const id = await inv.wrap(1);
    await expect(other.unwrap(id)).rejects.toMatchObject({ code: "verification_failed" });
    const err = await other.unwrap(id).catch((e) => e);
    expect(isIdsError(err)).toBe(true);
  });

  it("parse throws IdsError with code invalid_id and ParseError on cause", async () => {
    const key = await importWrappingKey(new Uint8Array(32).fill(0x42));
    const inv = createWrappedKeyId("inv", { kind: "u32", keys: [key], allowDuplicateBrand: true });
    let err: unknown;
    try {
      inv.parse("bad-input");
    } catch (e) {
      err = e;
    }
    expect(isIdsError(err)).toBe(true);
    expect((err as IdsError).code).toBe("invalid_id");
    expect((err as IdsError).cause).toBe("invalid_prefix");
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
    expectTypeOf({} as WrappedKeyCodec<"inv", "i32">).toMatchTypeOf<{
      wrap: (lookupKey: number) => Promise<Id<"inv">>;
      unwrap: (id: Id<"inv">) => Promise<number>;
      safeUnwrap: (input: unknown) => Promise<UnwrapResult<"inv", "i32">>;
    }>();
    expectTypeOf({} as WrappedKeyCodec<"inv", "u64">).toMatchTypeOf<{
      wrap: (lookupKey: bigint) => Promise<Id<"inv">>;
      unwrap: (id: Id<"inv">) => Promise<bigint>;
      safeUnwrap: (input: unknown) => Promise<UnwrapResult<"inv", "u64">>;
    }>();
    expectTypeOf({} as WrappedKeyCodec<"inv", "i64">).toMatchTypeOf<{
      wrap: (lookupKey: bigint) => Promise<Id<"inv">>;
      unwrap: (id: Id<"inv">) => Promise<bigint>;
      safeUnwrap: (input: unknown) => Promise<UnwrapResult<"inv", "i64">>;
    }>();
  });

  // --- Golden vectors ---

  it("golden vector u32: fixed wrapping key + lookup key 42 yields exact wire string", async () => {
    // wrapping key: 32 bytes of 0x77; HMAC covers brand ‖ kind ‖ lane
    const key = await importWrappingKey(new Uint8Array(32).fill(0x77));
    const inv = createWrappedKeyId("inv", { kind: "u32", keys: [key], allowDuplicateBrand: true });
    expect(await inv.wrap(42)).toBe("inv_a40dzajnegxm59r42ncns282vm");
  });

  it("golden vector i32: fixed wrapping key + lookup key -1 yields exact wire string", async () => {
    const key = await importWrappingKey(new Uint8Array(32).fill(0x77));
    const inv = createWrappedKeyId("inv", { kind: "i32", keys: [key], allowDuplicateBrand: true });
    expect(await inv.wrap(-1)).toBe("inv_ge4jpwg9wewpnx0cjxyx59424g");
  });

  it("golden vector u64: fixed wrapping key + lookup key 0xdeadbeefn yields exact wire string", async () => {
    const key = await importWrappingKey(new Uint8Array(32).fill(0x77));
    const inv = createWrappedKeyId("inv", { kind: "u64", keys: [key], allowDuplicateBrand: true });
    expect(await inv.wrap(0xdeadbeefn)).toBe("inv_rbywwjb38we19463jmr6jgj5hg");
  });

  it("golden vector i64: fixed wrapping key + lookup key -1n yields exact wire string", async () => {
    const key = await importWrappingKey(new Uint8Array(32).fill(0x77));
    const inv = createWrappedKeyId("inv", { kind: "i64", keys: [key], allowDuplicateBrand: true });
    expect(await inv.wrap(-1n)).toBe("inv_b65ndnfdgx2hzhhyay2qchw888");
  });

  // --- fast-check property tests ---

  describe("fast-check property tests", () => {
    let sharedKey: WrappingKey;

    beforeAll(async () => {
      sharedKey = await importWrappingKey(new Uint8Array(32).fill(0x77));
    });

    it("safeParse never throws on arbitrary input", () => {
      const inv = createWrappedKeyId("inv", {
        kind: "u32",
        keys: [sharedKey],
        allowDuplicateBrand: true,
      });
      fc.assert(
        fc.property(fc.string(), (s) => {
          inv.safeParse(s);
          return true;
        }),
      );
    });

    it("safeParse: when ok, returned id satisfies is()", () => {
      const inv = createWrappedKeyId("inv", {
        kind: "u32",
        keys: [sharedKey],
        allowDuplicateBrand: true,
      });
      fc.assert(
        fc.property(fc.string(), (s) => {
          const r = inv.safeParse(s);
          return !r.ok || inv.is(r.id);
        }),
      );
    });

    it("round-trip u32: wrap → unwrap is identity for arbitrary in-range values", async () => {
      const inv = createWrappedKeyId("inv", {
        kind: "u32",
        keys: [sharedKey],
        allowDuplicateBrand: true,
      });
      await fc.assert(
        fc.asyncProperty(fc.integer({ min: 0, max: 0xffff_ffff }), async (v) => {
          const id = await inv.wrap(v);
          return (await inv.unwrap(id)) === v;
        }),
      );
    });

    it("round-trip i32: wrap → unwrap is identity for arbitrary in-range values", async () => {
      const inv = createWrappedKeyId("inv", {
        kind: "i32",
        keys: [sharedKey],
        allowDuplicateBrand: true,
      });
      await fc.assert(
        fc.asyncProperty(fc.integer({ min: -0x8000_0000, max: 0x7fff_ffff }), async (v) => {
          const id = await inv.wrap(v);
          return (await inv.unwrap(id)) === v;
        }),
      );
    });

    it("round-trip u64: wrap → unwrap is identity for arbitrary in-range values", async () => {
      const inv = createWrappedKeyId("inv", {
        kind: "u64",
        keys: [sharedKey],
        allowDuplicateBrand: true,
      });
      await fc.assert(
        fc.asyncProperty(fc.bigInt({ min: 0n, max: 0xffff_ffff_ffff_ffffn }), async (v) => {
          const id = await inv.wrap(v);
          return (await inv.unwrap(id)) === v;
        }),
      );
    });

    it("round-trip i64: wrap → unwrap is identity for arbitrary in-range values", async () => {
      const inv = createWrappedKeyId("inv", {
        kind: "i64",
        keys: [sharedKey],
        allowDuplicateBrand: true,
      });
      await fc.assert(
        fc.asyncProperty(fc.bigInt({ min: -(1n << 63n), max: (1n << 63n) - 1n }), async (v) => {
          const id = await inv.wrap(v);
          return (await inv.unwrap(id)) === v;
        }),
      );
    });

    it("tamper invariant: flipping any bit in the 128-bit payload causes safeUnwrap to return verification_failed", async () => {
      const inv = createWrappedKeyId("inv", {
        kind: "u32",
        keys: [sharedKey],
        allowDuplicateBrand: true,
      });
      const fixedId = await inv.wrap(42);
      await fc.assert(
        fc.asyncProperty(fc.integer({ min: 0, max: 127 }), async (bitIndex) => {
          const payload = payloadBytesFromId("inv_", fixedId);
          const tampered = new Uint8Array(payload);
          const byteIdx = bitIndex >> 3;
          tampered[byteIdx] = tampered[byteIdx]! ^ (1 << (7 - (bitIndex & 7)));
          const result = await inv.safeUnwrap(toWireId("inv_", tampered));
          return result.ok === false && result.error === "verification_failed";
        }),
      );
    });

    it("key encode/decode round-trip: encodeWrappingKey → decodeWrappingKey is identity for all lengths and formats", () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.uint8Array({ minLength: 16, maxLength: 16 }),
            fc.uint8Array({ minLength: 24, maxLength: 24 }),
            fc.uint8Array({ minLength: 32, maxLength: 32 }),
          ),
          fc.constantFrom("hex" as WrappingKeyFormat, "base64url" as WrappingKeyFormat),
          (bytes, fmt) => {
            const decoded = decodeWrappingKey(encodeWrappingKey(bytes, fmt), fmt);
            return decoded.length === bytes.length && decoded.every((b, i) => b === bytes[i]);
          },
        ),
      );
    });

    it("decodeWrappingKey never throws on arbitrary string input", () => {
      fc.assert(
        fc.property(
          fc.string(),
          fc.constantFrom("hex" as WrappingKeyFormat, "base64url" as WrappingKeyFormat),
          (s, fmt) => {
            try {
              decodeWrappingKey(s, fmt);
            } catch (e) {
              return isIdsError(e);
            }
            return true;
          },
        ),
      );
    });
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
  const tag = await hmacTag(material.hmacKey, brand, "u32", lane);
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

async function nonCanonicalI32Id(
  prefix: "inv_",
  brand: "inv",
  key: WrappingKey,
): Promise<Id<"inv">> {
  const material = getWrappingKeyMaterial(key);
  const lane = new Uint8Array(tagByteLength);
  lane.fill(0xff, 4);
  const tag = await hmacTag(material.hmacKey, brand, "i32", lane);
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

async function hmacTag(
  hmacKey: webcrypto.CryptoKey,
  brand: "inv",
  kind: "u32" | "i32",
  lane: Uint8Array,
): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const brandBytes = encoder.encode(brand);
  const kindBytes = encoder.encode(kind);
  const msgLen = 4 + brandBytes.length + 4 + kindBytes.length + lane.length;
  const message = new Uint8Array(msgLen);
  let offset = 0;
  const writeLen32 = (v: number) => {
    message[offset++] = (v >>> 24) & 0xff;
    message[offset++] = (v >>> 16) & 0xff;
    message[offset++] = (v >>> 8) & 0xff;
    message[offset++] = v & 0xff;
  };
  writeLen32(brandBytes.length);
  message.set(brandBytes, offset);
  offset += brandBytes.length;
  writeLen32(kindBytes.length);
  message.set(kindBytes, offset);
  offset += kindBytes.length;
  message.set(lane, offset);
  const signature = new Uint8Array(
    await crypto.subtle.sign("HMAC", hmacKey, message as Uint8Array<ArrayBuffer>),
  );
  return signature.subarray(0, tagByteLength);
}
