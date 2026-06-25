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
import {
  createOpaqueTimestampId,
  decodeOpaqueKey,
  encodeOpaqueKey,
  importOpaqueKey,
  isIdsError,
  type OpaqueKey,
  type OpaqueKeyFormat,
  type OpaqueTimestampOptions,
} from "./index.js";
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

  it("round-trips a generated id through extractTimestamp", async () => {
    const key = await importOpaqueKey(new Uint8Array(16));
    const fixed = new Date("2026-05-28T12:00:00Z");
    const usr = createOpaqueTimestampId("usr", { key, now: () => fixed.getTime() });
    const id = await usr.generate();
    await expect(usr.extractTimestamp(id)).resolves.toEqual(fixed);
  });

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
    const a = createOpaqueTimestampId("usr", { key: keyA });
    const b = createOpaqueTimestampId("usr", { key: keyB });
    const id = await a.generate();
    const recovered = await b.extractTimestamp(id);
    expect(recovered).toBeInstanceOf(Date);
    expect(Number.isFinite(recovered.getTime())).toBe(true);
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
    expect(() => createOpaqueTimestampId("a", { key })).toThrow();
    expect(() => createOpaqueTimestampId("aaaa", { key })).toThrow();
    expect(() => createOpaqueTimestampId("!@?", { key })).toThrow();
  });

  it("generateAt() rejects pre-epoch dates with the same message as the timestamp codec", async () => {
    const key = await importOpaqueKey(new Uint8Array(16));
    const usr = createOpaqueTimestampId("usr", { key });
    await expect(usr.generateAt(new Date(-1))).rejects.toThrow("timestamp is negative");
  });

  it("generateAt() rejects dates that overflow 48 bits with the same message as the timestamp codec", async () => {
    const key = await importOpaqueKey(new Uint8Array(16));
    const usr = createOpaqueTimestampId("usr", { key });
    await expect(usr.generateAt(new Date(2 ** 48))).rejects.toThrow(
      "timestamp exceeds 48-bit range",
    );
  });

  it("generateAt() rejects an Invalid Date (NaN timestamp)", async () => {
    const key = await importOpaqueKey(new Uint8Array(16));
    const usr = createOpaqueTimestampId("usr", { key });
    await expect(usr.generateAt(new Date(NaN))).rejects.toThrow("timestamp is not a number");
  });

  // --- Golden vector ---

  it("golden vector: fixed ts + rng + AES key yields exact wire string", async () => {
    // key: 16 bytes of 0x11; ts: 0x123456789abc; rng: all bytes 0x55
    // AES-CBC(key, zero-IV, ts6 ‖ rand10) → first 16 bytes → base32 payload.
    const key = await importOpaqueKey(new Uint8Array(16).fill(0x11));
    const opc = createOpaqueTimestampId("opc", {
      key,
      now: () => 0x123456789abc,
      rng: (target) => {
        target.fill(0x55);
      },
    });
    expect(await opc.generate()).toBe("opc_vwpbpgz86xc98hvyk801n1n43m");
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
  // Each test uses a unique brand to avoid module-level registry contamination
  // across tests in the same process. Distinct from the zaa-zaf range used by
  // timestamp.test.ts.
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let key: OpaqueKey;

  beforeAll(async () => {
    key = await importOpaqueKey(new Uint8Array(16));
  });

  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    vi.unstubAllEnvs();
  });

  it("warns when a brand registered by createTimestampId is then passed to createOpaqueTimestampId", () => {
    createTimestampId("zba");
    expect(warnSpy).not.toHaveBeenCalled();
    createOpaqueTimestampId("zba", { key });
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("warns when a brand registered by createOpaqueTimestampId is then passed to createTimestampId", () => {
    createOpaqueTimestampId("zbb", { key });
    expect(warnSpy).not.toHaveBeenCalled();
    createTimestampId("zbb");
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("allowDuplicateBrand on createOpaqueTimestampId suppresses the cross-codec warning", () => {
    createTimestampId("zbc");
    createOpaqueTimestampId("zbc", { key, allowDuplicateBrand: true });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("allowDuplicateBrand on createTimestampId suppresses the cross-codec warning", () => {
    createOpaqueTimestampId("zbd", { key });
    createTimestampId("zbd", { allowDuplicateBrand: true });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("in production: no warning and the brand is not registered across codecs", () => {
    vi.stubEnv("NODE_ENV", "production");
    createTimestampId("zbe");
    createOpaqueTimestampId("zbe", { key });
    expect(warnSpy).not.toHaveBeenCalled();

    // Lift production gate; production calls must not have populated the registry.
    vi.unstubAllEnvs();
    createTimestampId("zbe");
    expect(warnSpy).not.toHaveBeenCalled();
    createOpaqueTimestampId("zbe", { key });
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});
