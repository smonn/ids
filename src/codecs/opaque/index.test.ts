import { fromAny } from "@total-typescript/shoehorn";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  expectTypeOf,
  it,
  vi,
} from "vitest";
import * as fc from "fast-check";
import { createTimestampId } from "../timestamp/index.js";
import { resetBrandRegistry } from "../_kernel/registry.js";
import {
  createOpaqueTimestampId,
  decodeOpaqueKey,
  encodeOpaqueKey,
  importOpaqueKey,
  type OpaqueKey,
  type OpaqueKeyFormat,
  type OpaqueTimestampOptions,
} from "./index.js";
import { isIdsError } from "../../error.js";
import type { Id, JsonSchema, ParseResult } from "../../types.js";
import { toWireId } from "../../wire/envelope.js";

describe("opaque", () => {
  // Recreates codecs for the same brand across tests; brand-registry warnings
  // are silenced here. Dedicated cross-codec registry tests use unique brands
  // and assert on the warning explicitly.
  let warnSilencer: ReturnType<typeof vi.spyOn>;
  beforeAll(() => {
    warnSilencer = vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterAll(() => {
    warnSilencer.mockRestore();
  });
  beforeEach(() => {
    resetBrandRegistry();
  });
  afterEach(() => {
    resetBrandRegistry();
  });

  it("round-trips a generated id through extractTimestamp", async () => {
    const key = await importOpaqueKey(new Uint8Array(16));
    const fixed = new Date("2026-05-28T12:00:00Z");
    const usr = createOpaqueTimestampId("usr", { key, now: () => fixed.getTime() });
    const id = await usr.generate();
    await expect(usr.extractTimestamp(id)).resolves.toEqual(fixed);
  });

  it("derives the AES key via HKDF, not raw import (ADR-0027)", async () => {
    // The operator bytes are HKDF input keying material, not the AES key
    // itself. The fixed inputs below produced this id under the pre-ADR-0027
    // raw-import construction; HKDF derivation must yield a different id.
    const key = await importOpaqueKey(new Uint8Array(16).map((_, i) => i));
    const now = () => 0x123456789abc;
    const rng = (t: Uint8Array): void => {
      t.fill(0x42);
    };
    const usr = createOpaqueTimestampId("usr", { key, now, rng });
    expect(await usr.generate()).not.toBe("usr_mkfn9zzq1pjz1zkk9qpwr0e9q4");
  });

  it.each([16, 24, 32])(
    "round-trips through extractTimestamp for a %d-byte key (always AES-256 via HKDF)",
    async (len) => {
      const key = await importOpaqueKey(new Uint8Array(len).map((_, i) => i));
      const fixed = new Date("2026-05-28T12:00:00Z");
      const codec = createOpaqueTimestampId("usr", { key, now: () => fixed.getTime() });
      const id = await codec.generate();
      await expect(codec.extractTimestamp(id)).resolves.toEqual(fixed);
    },
  );

  it("different keys produce different ids for the same plaintext", async () => {
    const keyA = await importOpaqueKey(new Uint8Array(16).fill(0xaa));
    const keyB = await importOpaqueKey(new Uint8Array(16).fill(0xbb));
    const now = () => 0x123456789abc;
    const rng = (target: Uint8Array): void => {
      target.fill(0x42);
    };
    const a = createOpaqueTimestampId("usr", { key: keyA, now, rng });
    const b = createOpaqueTimestampId("usr", { key: keyB, now, rng });
    expect(await a.generate()).not.toBe(await b.generate());
  });

  it("different rng produces different ids under the same key and timestamp", async () => {
    const key = await importOpaqueKey(new Uint8Array(16));
    const now = () => 0x123456789abc;
    const a = createOpaqueTimestampId("usr", {
      key,
      now,
      rng: (t) => {
        t.fill(0x00);
      },
    });
    const b = createOpaqueTimestampId("usr", {
      key,
      now,
      rng: (t) => {
        t.fill(0xff);
      },
    });
    expect(await a.generate()).not.toBe(await b.generate());
  });

  it("opaque id for a known plaintext differs from the timestamp-codec id for the same plaintext", async () => {
    const key = await importOpaqueKey(new Uint8Array(16));
    const now = () => 0x123456789abc;
    const rng = (target: Uint8Array): void => {
      target.fill(0x42);
    };
    const opaqueUsr = createOpaqueTimestampId("usr", { key, now, rng });
    const plainUsr = createTimestampId("usr", { now, rng });
    expect(await opaqueUsr.generate()).not.toBe(plainUsr.generate());
  });

  it.each([0, 1, 0x123456789abc, 2 ** 48 - 1])(
    "generateAt() round-trips through extractTimestamp at ms=%d",
    async (ms) => {
      const key = await importOpaqueKey(new Uint8Array(16));
      const usr = createOpaqueTimestampId("usr", { key });
      const d = new Date(ms);
      await expect(usr.extractTimestamp(await usr.generateAt(d))).resolves.toEqual(d);
    },
  );

  it("extractTimestamp with the wrong key returns a Date without throwing (garbage in, garbage out)", async () => {
    const keyA = await importOpaqueKey(new Uint8Array(16).fill(0xaa));
    const keyB = await importOpaqueKey(new Uint8Array(16).fill(0xbb));
    const fixedMs = new Date("2026-05-28T12:00:00Z").getTime();
    const a = createOpaqueTimestampId("usr", { key: keyA, now: () => fixedMs });
    const b = createOpaqueTimestampId("usr", { key: keyB });
    const id = await a.generate();
    const recovered = await b.extractTimestamp(id);
    expect(recovered).toBeInstanceOf(Date);
    expect(Number.isFinite(recovered.getTime())).toBe(true);
    expect(recovered.getTime()).not.toBe(fixedMs);
  });

  it("extractTimestamp never throws on 100 random canonical ids (decrypt-never-throws invariant)", async () => {
    const key = await importOpaqueKey(new Uint8Array(16));
    const usr = createOpaqueTimestampId("usr", { key });
    for (let i = 0; i < 100; i++) {
      const payload = crypto.getRandomValues(new Uint8Array(16));
      const id = toWireId("usr_", payload);
      const result = await usr.extractTimestamp(id);
      expect(result).toBeInstanceOf(Date);
      expect(Number.isFinite(result.getTime())).toBe(true);
    }
    // boundary extremes: all-zero and all-0xFF payloads must not throw
    const allZero = toWireId("usr_", new Uint8Array(16));
    const allZeroResult = await usr.extractTimestamp(allZero);
    expect(allZeroResult).toBeInstanceOf(Date);
    expect(Number.isFinite(allZeroResult.getTime())).toBe(true);

    const allFf = toWireId("usr_", new Uint8Array(16).fill(0xff));
    const allFfResult = await usr.extractTimestamp(allFf);
    expect(allFfResult).toBeInstanceOf(Date);
    expect(Number.isFinite(allFfResult.getTime())).toBe(true);
  });

  it("generate() output matches the canonical wire pattern", async () => {
    const key = await importOpaqueKey(new Uint8Array(16));
    const usr = createOpaqueTimestampId("usr", { key });
    expect(await usr.generate()).toMatch(/^usr_[0-9a-hjkmnp-tv-z]{25}[048cgmrw]$/);
  });

  it("OpaqueTimestampOptions accepts reusable objects that omit defaulted injection points", async () => {
    const key = await importOpaqueKey(new Uint8Array(16));
    const options: OpaqueTimestampOptions = { key };
    const usr = createOpaqueTimestampId("usr", options);

    expect(await usr.generate()).toMatch(/^usr_[0-9a-hjkmnp-tv-z]{25}[048cgmrw]$/);
  });

  it("falls back to default injections when Opaque Timestamp options are explicitly undefined", async () => {
    const key = await importOpaqueKey(new Uint8Array(16));
    const before = Date.now();
    const usr = createOpaqueTimestampId(
      "usr",
      fromAny({
        key,
        now: undefined,
        rng: undefined,
      }),
    );
    const id = await usr.generate();
    const after = Date.now();

    expect(usr.is(id)).toBe(true);
    const timestamp = await usr.extractTimestamp(id);
    expect(timestamp.getTime()).toBeGreaterThanOrEqual(before);
    expect(timestamp.getTime()).toBeLessThanOrEqual(after);
  });

  it("is/parse/safeParse run synchronously without the key", async () => {
    const key = await importOpaqueKey(new Uint8Array(16));
    const usr = createOpaqueTimestampId("usr", { key });
    const synthetic = "usr_" + "0".repeat(26);
    expect(usr.is(synthetic)).toBe(true);
    expect(usr.parse(synthetic)).toBe(synthetic);
    expect(usr.safeParse(synthetic)).toEqual({ ok: true, id: synthetic });
  });

  it("safeParse() of a foreign prefix fails with invalid_prefix", async () => {
    const key = await importOpaqueKey(new Uint8Array(16));
    const usr = createOpaqueTimestampId("usr", { key });
    expect(usr.safeParse("org_01h7b3k9rqxn1cw3p9r8t2sgkw")).toEqual({
      ok: false,
      error: "invalid_prefix",
    });
  });

  it("safeParse() normalises lenient input to canonical form", async () => {
    const key = await importOpaqueKey(new Uint8Array(16));
    const usr = createOpaqueTimestampId("usr", { key });
    expect(usr.safeParse("USR_Olh7b3k9rqxnIcw3p9r8t2sgkw")).toEqual({
      ok: true,
      id: "usr_01h7b3k9rqxn1cw3p9r8t2sgkw",
    });
  });

  it("toJsonSchema() pattern matches the canonical wire form (same as timestamp codec)", async () => {
    const key = await importOpaqueKey(new Uint8Array(16));
    const usrOpaque = createOpaqueTimestampId("usr", { key });
    const usrPlain = createTimestampId("usr");
    expect(usrOpaque.toJsonSchema().pattern).toBe(usrPlain.toJsonSchema().pattern);
  });

  it("toJsonSchema() example matches its own pattern", async () => {
    const key = await importOpaqueKey(new Uint8Array(16));
    const usr = createOpaqueTimestampId("usr", { key });
    const schema = usr.toJsonSchema();
    expect(new RegExp(schema.pattern).test(schema.example)).toBe(true);
    expect(usr.is(schema.example)).toBe(true);
  });

  it("~standard.validate returns canonical Id on success", async () => {
    const key = await importOpaqueKey(new Uint8Array(16));
    const usr = createOpaqueTimestampId("usr", { key });
    expect(usr["~standard"].validate("usr_Olh7b3k9rqxnIcw3p9r8t2sgkw")).toEqual({
      value: "usr_01h7b3k9rqxn1cw3p9r8t2sgkw",
    });
  });

  it("~standard exposes version 1 and vendor '@smonn/ids'", async () => {
    const key = await importOpaqueKey(new Uint8Array(16));
    const usr = createOpaqueTimestampId("usr", { key });
    expect(usr["~standard"].version).toBe(1);
    expect(usr["~standard"].vendor).toBe("@smonn/ids");
  });

  it("OpaqueTimestampCodec has no min/maxIdForTime (encrypted timestamps don't sort by time)", async () => {
    const key = await importOpaqueKey(new Uint8Array(16));
    const usr = createOpaqueTimestampId("usr", { key });
    expectTypeOf(usr).not.toHaveProperty("minIdForTime");
    expectTypeOf(usr).not.toHaveProperty("maxIdForTime");
  });

  it("OpaqueTimestampOptions.key is typed as OpaqueKey", () => {
    expectTypeOf<OpaqueTimestampOptions["key"]>().toEqualTypeOf<OpaqueKey>();
  });

  it("key-dependent methods are async; key-free methods are sync", async () => {
    const key = await importOpaqueKey(new Uint8Array(16));
    const usr = createOpaqueTimestampId("usr", { key });
    expectTypeOf(usr.generate).returns.toEqualTypeOf<Promise<Id<"usr">>>();
    expectTypeOf(usr.generateAt).returns.toEqualTypeOf<Promise<Id<"usr">>>();
    expectTypeOf(usr.extractTimestamp).returns.toEqualTypeOf<Promise<Date>>();
    expectTypeOf(usr.is).returns.toEqualTypeOf<boolean>();
    expectTypeOf(usr.parse).returns.toEqualTypeOf<Id<"usr">>();
    expectTypeOf(usr.safeParse).returns.toEqualTypeOf<ParseResult<"usr">>();
    expectTypeOf(usr.toJsonSchema).returns.toEqualTypeOf<JsonSchema>();
  });

  it("rejects brands that are not exactly three a-z characters", async () => {
    const key = await importOpaqueKey(new Uint8Array(16));
    // @ts-expect-error — "a" (1 char) is not a valid brand; ValidBrand<"a"> = never
    expect(() => createOpaqueTimestampId("a", { key })).toThrow();
    // @ts-expect-error — "aaaa" (4 chars) is not a valid brand; ValidBrand<"aaaa"> = never
    expect(() => createOpaqueTimestampId("aaaa", { key })).toThrow();
    // @ts-expect-error — "!@?" (non-alpha) is not a valid brand; ValidBrand<"!@?"> = never
    expect(() => createOpaqueTimestampId("!@?", { key })).toThrow();
  });

  it("generateAt() rejects pre-epoch dates", async () => {
    const key = await importOpaqueKey(new Uint8Array(16));
    const usr = createOpaqueTimestampId("usr", { key });
    let err: unknown;
    try {
      await usr.generateAt(new Date(-1));
    } catch (e) {
      err = e;
    }
    expect(isIdsError(err) && err.code === "invalid_timestamp").toBe(true);
  });

  it("generateAt() rejects dates that overflow 48 bits", async () => {
    const key = await importOpaqueKey(new Uint8Array(16));
    const usr = createOpaqueTimestampId("usr", { key });
    let err: unknown;
    try {
      await usr.generateAt(new Date(2 ** 48));
    } catch (e) {
      err = e;
    }
    expect(isIdsError(err) && err.code === "invalid_timestamp").toBe(true);
  });

  it("generateAt() rejects an Invalid Date (NaN timestamp)", async () => {
    const key = await importOpaqueKey(new Uint8Array(16));
    const usr = createOpaqueTimestampId("usr", { key });
    let err: unknown;
    try {
      await usr.generateAt(new Date(NaN));
    } catch (e) {
      err = e;
    }
    expect(isIdsError(err) && err.code === "invalid_timestamp").toBe(true);
  });

  // --- Golden vector ---

  it("golden vector: fixed ts + rng + AES key yields exact wire string", async () => {
    // key: 16 bytes of 0x11; ts: 0x123456789abc; rng: all bytes 0x55
    // The 16 bytes are HKDF input keying material (ADR-0027): the AES-256 key is
    // HKDF(bytes, "@smonn/ids/opaque/aes"). AES-CBC(derivedKey, zero-IV,
    // ts6 ‖ rand10) → first 16 bytes → base32 payload.
    const key = await importOpaqueKey(new Uint8Array(16).fill(0x11));
    const opc = createOpaqueTimestampId("opc", {
      key,
      now: () => 0x123456789abc,
      rng: (target) => {
        target.fill(0x55);
      },
    });
    expect(await opc.generate()).toBe("opc_ncb9yfq6hjamwep9jmfyyy1wsw");
  });

  // --- fast-check property tests ---

  describe("fast-check property tests", () => {
    let fcKey: OpaqueKey;

    beforeAll(async () => {
      fcKey = await importOpaqueKey(new Uint8Array(16).fill(0x11));
    });

    it("safeParse never throws on arbitrary input", () => {
      const opc = createOpaqueTimestampId("opc", { key: fcKey, allowDuplicateBrand: true });
      fc.assert(
        fc.property(fc.string(), (s) => {
          opc.safeParse(s);
          return true;
        }),
      );
    });

    it("safeParse: when ok, returned id satisfies is()", () => {
      const opc = createOpaqueTimestampId("opc", { key: fcKey, allowDuplicateBrand: true });
      fc.assert(
        fc.property(fc.string(), (s) => {
          const r = opc.safeParse(s);
          return !r.ok || opc.is(r.id);
        }),
      );
    });

    it("key encode/decode round-trip: encodeOpaqueKey → decodeOpaqueKey is identity for all lengths and formats", () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.uint8Array({ minLength: 16, maxLength: 16 }),
            fc.uint8Array({ minLength: 24, maxLength: 24 }),
            fc.uint8Array({ minLength: 32, maxLength: 32 }),
          ),
          fc.constantFrom("hex" as OpaqueKeyFormat, "base64url" as OpaqueKeyFormat),
          (bytes, fmt) => {
            const decoded = decodeOpaqueKey(encodeOpaqueKey(bytes, fmt), fmt);
            return decoded.length === bytes.length && decoded.every((b, i) => b === bytes[i]);
          },
        ),
      );
    });

    it("decodeOpaqueKey never throws on arbitrary string input", () => {
      fc.assert(
        fc.property(
          fc.string(),
          fc.constantFrom("hex" as OpaqueKeyFormat, "base64url" as OpaqueKeyFormat),
          (s, fmt) => {
            try {
              decodeOpaqueKey(s, fmt);
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

describe("cross-codec brand registry", () => {
  // resetBrandRegistry() in beforeEach isolates each case from module-level
  // registry contamination (ADR-0021), so a stable brand can be reused instead
  // of minting throwaway ones.
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let key: OpaqueKey;

  beforeAll(async () => {
    key = await importOpaqueKey(new Uint8Array(16));
  });

  beforeEach(() => {
    resetBrandRegistry();
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    vi.unstubAllEnvs();
    resetBrandRegistry();
  });

  it("warns when a brand registered by createTimestampId is then passed to createOpaqueTimestampId", () => {
    createTimestampId("usr");
    expect(warnSpy).not.toHaveBeenCalled();
    createOpaqueTimestampId("usr", { key });
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("warns when a brand registered by createOpaqueTimestampId is then passed to createTimestampId", () => {
    createOpaqueTimestampId("usr", { key });
    expect(warnSpy).not.toHaveBeenCalled();
    createTimestampId("usr");
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("allowDuplicateBrand on createOpaqueTimestampId suppresses the cross-codec warning", () => {
    createTimestampId("usr");
    createOpaqueTimestampId("usr", { key, allowDuplicateBrand: true });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("allowDuplicateBrand on createTimestampId suppresses the cross-codec warning", () => {
    createOpaqueTimestampId("usr", { key });
    createTimestampId("usr", { allowDuplicateBrand: true });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("in production: no warning and the brand is not registered across codecs", () => {
    vi.stubEnv("NODE_ENV", "production");
    createTimestampId("usr");
    createOpaqueTimestampId("usr", { key });
    expect(warnSpy).not.toHaveBeenCalled();

    // Lift production gate; production calls must not have populated the registry.
    vi.unstubAllEnvs();
    createTimestampId("usr");
    expect(warnSpy).not.toHaveBeenCalled();
    createOpaqueTimestampId("usr", { key });
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});

describe("Opaque Timestamp codec — UUID methods", () => {
  let opqKey: OpaqueKey;
  let warnSilencer: ReturnType<typeof vi.spyOn>;
  beforeAll(async () => {
    warnSilencer = vi.spyOn(console, "warn").mockImplementation(() => {});
    opqKey = await importOpaqueKey(new Uint8Array(16));
  });
  afterAll(() => {
    warnSilencer.mockRestore();
  });

  it("toUUID returns a 36-char lowercase hyphenated UUID for a parsed id", () => {
    const opq = createOpaqueTimestampId("opq", { key: opqKey, allowDuplicateBrand: true });
    // Use parse to get a valid Id<Brand> without async generate.
    const id = opq.parse("opq_" + "0".repeat(26));
    expect(opq.toUUID(id)).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it("fromUUID(toUUID(id)) === id (round-trip)", () => {
    const opq = createOpaqueTimestampId("opq", { key: opqKey, allowDuplicateBrand: true });
    const id = opq.parse("opq_" + "0".repeat(26));
    expect(opq.fromUUID(opq.toUUID(id))).toBe(id);
  });

  it("safeFromUUID returns ok:true for a valid UUID and result passes is()", () => {
    const opq = createOpaqueTimestampId("opq", { key: opqKey, allowDuplicateBrand: true });
    const result = opq.safeFromUUID("01234567-89ab-cdef-0123-456789abcdef");
    expect(result.ok).toBe(true);
    if (result.ok) expect(opq.is(result.id)).toBe(true);
  });

  it("safeFromUUID returns not_string for non-string", () => {
    const opq = createOpaqueTimestampId("opq", { key: opqKey, allowDuplicateBrand: true });
    expect(opq.safeFromUUID(null)).toEqual({ ok: false, error: "not_string" });
  });

  it("safeFromUUID returns invalid_uuid for malformed UUID", () => {
    const opq = createOpaqueTimestampId("opq", { key: opqKey, allowDuplicateBrand: true });
    expect(opq.safeFromUUID("not-a-uuid")).toEqual({ ok: false, error: "invalid_uuid" });
  });
});
