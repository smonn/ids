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
import { createId } from "./id.js";
import { createOpaqueId, importOpaqueKey, type OpaqueOptions } from "./opaque.js";
import type { Id, JsonSchema, ParseResult } from "./types.js";

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
    const usr = createOpaqueId("usr", { key, now: () => fixed.getTime() });
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
    const a = createOpaqueId("usr", { key: keyA, now, rng });
    const b = createOpaqueId("usr", { key: keyB, now, rng });
    expect(await a.generate()).not.toBe(await b.generate());
  });

  it("different rng produces different ids under the same key and timestamp", async () => {
    const key = await importOpaqueKey(new Uint8Array(16));
    const now = () => 0x123456789abc;
    const a = createOpaqueId("usr", {
      key,
      now,
      rng: (t) => {
        t.fill(0x00);
      },
    });
    const b = createOpaqueId("usr", {
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
    const opaqueUsr = createOpaqueId("usr", { key, now, rng });
    const plainUsr = createId("usr", { now, rng });
    expect(await opaqueUsr.generate()).not.toBe(plainUsr.generate());
  });

  it.each([0, 1, 0x123456789abc, 2 ** 48 - 1])(
    "generateAt() round-trips through extractTimestamp at ms=%d",
    async (ms) => {
      const key = await importOpaqueKey(new Uint8Array(16));
      const usr = createOpaqueId("usr", { key });
      const d = new Date(ms);
      await expect(usr.extractTimestamp(await usr.generateAt(d))).resolves.toEqual(d);
    },
  );

  it("extractTimestamp with the wrong key returns a Date without throwing (garbage in, garbage out)", async () => {
    const keyA = await importOpaqueKey(new Uint8Array(16).fill(0xaa));
    const keyB = await importOpaqueKey(new Uint8Array(16).fill(0xbb));
    const a = createOpaqueId("usr", { key: keyA });
    const b = createOpaqueId("usr", { key: keyB });
    const id = await a.generate();
    const recovered = await b.extractTimestamp(id);
    expect(recovered).toBeInstanceOf(Date);
    expect(Number.isFinite(recovered.getTime())).toBe(true);
  });

  it("generate() output matches the canonical wire pattern", async () => {
    const key = await importOpaqueKey(new Uint8Array(16));
    const usr = createOpaqueId("usr", { key });
    expect(await usr.generate()).toMatch(/^usr_[0-9a-hjkmnp-tv-z]{26}$/);
  });

  it("OpaqueOptions accepts reusable objects that omit defaulted injection points", async () => {
    const key = await importOpaqueKey(new Uint8Array(16));
    const options: OpaqueOptions = { key };
    const usr = createOpaqueId("usr", options);

    expect(await usr.generate()).toMatch(/^usr_[0-9a-hjkmnp-tv-z]{26}$/);
  });

  it("is/parse/safeParse run synchronously without the key", async () => {
    const key = await importOpaqueKey(new Uint8Array(16));
    const usr = createOpaqueId("usr", { key });
    const synthetic = "usr_" + "0".repeat(26);
    expect(usr.is(synthetic)).toBe(true);
    expect(usr.parse(synthetic)).toBe(synthetic);
    expect(usr.safeParse(synthetic)).toEqual({ ok: true, id: synthetic });
  });

  it("safeParse() of a foreign prefix fails with invalid_prefix", async () => {
    const key = await importOpaqueKey(new Uint8Array(16));
    const usr = createOpaqueId("usr", { key });
    expect(usr.safeParse("org_01h7b3k9rqxn1cw3p9r8t2sgkz")).toEqual({
      ok: false,
      error: "invalid_prefix",
    });
  });

  it("safeParse() normalises lenient input to canonical form", async () => {
    const key = await importOpaqueKey(new Uint8Array(16));
    const usr = createOpaqueId("usr", { key });
    expect(usr.safeParse("USR_Olh7b3k9rqxnIcw3p9r8t2sgkz")).toEqual({
      ok: true,
      id: "usr_01h7b3k9rqxn1cw3p9r8t2sgkz",
    });
  });

  it("toJsonSchema() pattern matches the canonical wire form (same as timestamp codec)", async () => {
    const key = await importOpaqueKey(new Uint8Array(16));
    const usrOpaque = createOpaqueId("usr", { key });
    const usrPlain = createId("usr");
    expect(usrOpaque.toJsonSchema().pattern).toBe(usrPlain.toJsonSchema().pattern);
  });

  it("toJsonSchema() example matches its own pattern", async () => {
    const key = await importOpaqueKey(new Uint8Array(16));
    const usr = createOpaqueId("usr", { key });
    const schema = usr.toJsonSchema();
    expect(new RegExp(schema.pattern).test(schema.example)).toBe(true);
    expect(usr.is(schema.example)).toBe(true);
  });

  it("~standard.validate returns canonical Id on success", async () => {
    const key = await importOpaqueKey(new Uint8Array(16));
    const usr = createOpaqueId("usr", { key });
    expect(usr["~standard"].validate("usr_Olh7b3k9rqxnIcw3p9r8t2sgkz")).toEqual({
      value: "usr_01h7b3k9rqxn1cw3p9r8t2sgkz",
    });
  });

  it("~standard exposes version 1 and vendor '@smonn/ids'", async () => {
    const key = await importOpaqueKey(new Uint8Array(16));
    const usr = createOpaqueId("usr", { key });
    expect(usr["~standard"].version).toBe(1);
    expect(usr["~standard"].vendor).toBe("@smonn/ids");
  });

  it("OpaqueCodec has no min/maxIdForTime (encrypted timestamps don't sort by time)", async () => {
    const key = await importOpaqueKey(new Uint8Array(16));
    const usr = createOpaqueId("usr", { key });
    expectTypeOf(usr).not.toHaveProperty("minIdForTime");
    expectTypeOf(usr).not.toHaveProperty("maxIdForTime");
  });

  it("key-dependent methods are async; key-free methods are sync", async () => {
    const key = await importOpaqueKey(new Uint8Array(16));
    const usr = createOpaqueId("usr", { key });
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
    expect(() => createOpaqueId("a", { key })).toThrow();
    expect(() => createOpaqueId("aaaa", { key })).toThrow();
    expect(() => createOpaqueId("!@?", { key })).toThrow();
  });

  it("generateAt() rejects pre-epoch dates with the same message as the timestamp codec", async () => {
    const key = await importOpaqueKey(new Uint8Array(16));
    const usr = createOpaqueId("usr", { key });
    await expect(usr.generateAt(new Date(-1))).rejects.toThrow("timestamp is negative");
  });

  it("generateAt() rejects dates that overflow 48 bits with the same message as the timestamp codec", async () => {
    const key = await importOpaqueKey(new Uint8Array(16));
    const usr = createOpaqueId("usr", { key });
    await expect(usr.generateAt(new Date(2 ** 48))).rejects.toThrow(
      "timestamp exceeds 48-bit range",
    );
  });

  it("generateAt() rejects an Invalid Date (NaN timestamp)", async () => {
    const key = await importOpaqueKey(new Uint8Array(16));
    const usr = createOpaqueId("usr", { key });
    await expect(usr.generateAt(new Date(NaN))).rejects.toThrow("timestamp is not a number");
  });
});

describe("cross-codec brand registry", () => {
  // Each test uses a unique brand to avoid module-level registry contamination
  // across tests in the same process. Distinct from the zaa-zaf range used by
  // id.test.ts.
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let key: CryptoKey;

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

  it("warns when a brand registered by createId is then passed to createOpaqueId", () => {
    createId("zba");
    expect(warnSpy).not.toHaveBeenCalled();
    createOpaqueId("zba", { key });
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("warns when a brand registered by createOpaqueId is then passed to createId", () => {
    createOpaqueId("zbb", { key });
    expect(warnSpy).not.toHaveBeenCalled();
    createId("zbb");
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("allowDuplicateBrand on createOpaqueId suppresses the cross-codec warning", () => {
    createId("zbc");
    createOpaqueId("zbc", { key, allowDuplicateBrand: true });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("allowDuplicateBrand on createId suppresses the cross-codec warning", () => {
    createOpaqueId("zbd", { key });
    createId("zbd", { allowDuplicateBrand: true });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("in production: no warning and the brand is not registered across codecs", () => {
    vi.stubEnv("NODE_ENV", "production");
    createId("zbe");
    createOpaqueId("zbe", { key });
    expect(warnSpy).not.toHaveBeenCalled();

    // Lift production gate; production calls must not have populated the registry.
    vi.unstubAllEnvs();
    createId("zbe");
    expect(warnSpy).not.toHaveBeenCalled();
    createOpaqueId("zbe", { key });
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});
