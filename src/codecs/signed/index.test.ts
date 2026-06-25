import { describe, expect, it, beforeAll } from "vitest";
import * as fc from "fast-check";
import {
  createSignedTimestampId,
  decodeSigningKey,
  encodeSigningKey,
  importSigningKey,
  IdsError,
  isIdsError,
  type SafeVerifyResult,
  type SignedTimestampCodec,
  type SigningKey,
  type SigningKeyFormat,
  type IdsErrorCode,
} from "./index.js";
import type { Id } from "../../types.js";

describe("@smonn/ids/signed re-exports", () => {
  it("exports importSigningKey as a function", () => {
    expect(typeof importSigningKey).toBe("function");
  });

  it("exports encodeSigningKey as a function", () => {
    expect(typeof encodeSigningKey).toBe("function");
  });

  it("exports decodeSigningKey as a function", () => {
    expect(typeof decodeSigningKey).toBe("function");
  });

  it("exports IdsError class", () => {
    expect(typeof IdsError).toBe("function");
    const err = new IdsError("invalid_key_length", "test");
    expect(err).toBeInstanceOf(IdsError);
  });

  it("exports isIdsError guard", () => {
    expect(typeof isIdsError).toBe("function");
    const err = new IdsError("empty_keyring", "test");
    expect(isIdsError(err)).toBe(true);
  });

  it("SigningKeyFormat type covers hex and base64url", () => {
    const formats: SigningKeyFormat[] = ["hex", "base64url"];
    expect(formats).toHaveLength(2);
  });

  it("IdsErrorCode includes signing-key-relevant codes", () => {
    const codes: IdsErrorCode[] = [
      "invalid_key_format",
      "invalid_key_encoding",
      "invalid_key_length",
      "empty_keyring",
      "duplicate_keyring_entry",
    ];
    expect(codes).toHaveLength(5);
  });

  it("key helpers work end-to-end via the signed subpath", async () => {
    const raw = new Uint8Array(32).fill(0x42);
    const encoded = encodeSigningKey(raw, "hex");
    const decoded = decodeSigningKey(encoded, "hex");
    const key: SigningKey = await importSigningKey(decoded);
    expect(key).toBeDefined();
  });
});

describe("createSignedTimestampId", () => {
  async function makeKey(fill = 0x42): Promise<SigningKey> {
    return importSigningKey(new Uint8Array(32).fill(fill));
  }

  // The last base32 char encodes only 3 real payload bits + 2 zero-padding bits.
  // Flipping it can change only a padding bit (no payload change) depending on the
  // current value. Flip the second-to-last char instead — it encodes 5 full payload
  // bits firmly inside the tag region [11,16).
  function flipTagChar(id: string): string {
    const idx = id.length - 2;
    const c = id[idx]!;
    return id.slice(0, idx) + (c === "0" ? "1" : "0") + id.slice(idx + 1);
  }

  function flipCharAt(id: string, prefixLen: number, charIndex: number): string {
    const prefix = id.slice(0, prefixLen);
    const base32 = id.slice(prefixLen);
    const chars = base32.split("");
    chars[charIndex] = chars[charIndex] === "0" ? "1" : "0";
    return prefix + chars.join("");
  }

  it("exports createSignedTimestampId as a function", () => {
    expect(typeof createSignedTimestampId).toBe("function");
  });

  // --- Round-trip (tracer bullet) ---

  it("round-trip: generate() → verify() passes without throwing", async () => {
    const key = await makeKey();
    const codec = createSignedTimestampId("sgn", { keys: [key], allowDuplicateBrand: true });
    const id = await codec.generate();
    await expect(codec.verify(id)).resolves.toBeUndefined();
  });

  // --- Sort order ---

  it("IDs generated at earlier timestamps sort lexicographically before later ones", async () => {
    const key = await makeKey();
    const codec = createSignedTimestampId("sgn", { keys: [key], allowDuplicateBrand: true });
    const earlier = await codec.generateAt(new Date(1_000_000_000_000));
    const later = await codec.generateAt(new Date(2_000_000_000_000));
    expect(earlier < later).toBe(true);
  });

  // --- Verify pass ---

  it("safeVerify returns { ok: true, id } for a valid ID", async () => {
    const key = await makeKey();
    const codec = createSignedTimestampId("sgn", { keys: [key], allowDuplicateBrand: true });
    const id = await codec.generate();
    const result = await codec.safeVerify(id);
    expect(result).toEqual({ ok: true, id });
  });

  // --- Tamper failures ---

  it("verify fails when timestamp bytes are tampered", async () => {
    const key = await makeKey();
    const codec = createSignedTimestampId("sgn", { keys: [key], allowDuplicateBrand: true });
    const id = await codec.generate();
    // Timestamp bytes [0,6) → base32 chars 0-8 (char 9 crosses the boundary)
    // Flip char at index 3 — firmly in the timestamp region
    const tampered = flipCharAt(id, "sgn_".length, 3) as typeof id;
    await expect(codec.verify(tampered)).rejects.toMatchObject({ code: "verification_failed" });
  });

  it("verify fails when random bytes are tampered", async () => {
    const key = await makeKey();
    const codec = createSignedTimestampId("sgn", { keys: [key], allowDuplicateBrand: true });
    const id = await codec.generate();
    // Random bytes [6,11) → base32 chars ~10-17
    // Flip char at index 12 — firmly in the random region
    const tampered = flipCharAt(id, "sgn_".length, 12) as typeof id;
    await expect(codec.verify(tampered)).rejects.toMatchObject({ code: "verification_failed" });
  });

  it("verify fails when tag bytes are tampered", async () => {
    const key = await makeKey();
    const codec = createSignedTimestampId("sgn", { keys: [key], allowDuplicateBrand: true });
    const id = await codec.generate();
    // Tag bytes [11,16) → base32 chars 17-25; flip second-to-last (index 24, no padding issue)
    const tampered = flipTagChar(id) as typeof id;
    await expect(codec.verify(tampered)).rejects.toMatchObject({ code: "verification_failed" });
  });

  it("verify fails when brand prefix is forged (HMAC binds brand bytes)", async () => {
    const key = await makeKey();
    const brand1 = createSignedTimestampId("bra", { keys: [key], allowDuplicateBrand: true });
    const brand2 = createSignedTimestampId("brb", { keys: [key], allowDuplicateBrand: true });
    const id1 = await brand1.generate();
    // Re-prefix the same payload under brand2 — HMAC was computed with "bra", not "brb"
    const forgedId = ("brb_" + id1.slice("bra_".length)) as Id<"brb">;
    await expect(brand2.verify(forgedId)).rejects.toMatchObject({ code: "verification_failed" });
  });

  // --- Wrong-key failure ---

  it("verify fails under a different keyring (wrong key)", async () => {
    const key1 = await makeKey(0x11);
    const key2 = await makeKey(0x22);
    const codec1 = createSignedTimestampId("sgn", { keys: [key1], allowDuplicateBrand: true });
    const codec2 = createSignedTimestampId("sgn", { keys: [key2], allowDuplicateBrand: true });
    const id = await codec1.generate();
    await expect(codec2.verify(id)).rejects.toMatchObject({ code: "verification_failed" });
  });

  // --- Keyring trial ---

  it("keyring trial: ID signed under keys[1] still verifies when that entry is in the ring", async () => {
    const key1 = await makeKey(0x11);
    const key2 = await makeKey(0x22);
    // Sign with key2 as the current (first) key
    const signer = createSignedTimestampId("sgn", { keys: [key2], allowDuplicateBrand: true });
    const id = await signer.generate();
    // Verifier has key1 current, key2 as fallback — should still find a match
    const verifier = createSignedTimestampId("sgn", {
      keys: [key1, key2],
      allowDuplicateBrand: true,
    });
    await expect(verifier.verify(id)).resolves.toBeUndefined();
  });

  // --- Revoke ---

  it("revoke: ID signed under a removed entry fails verification", async () => {
    const key1 = await makeKey(0x33);
    const key2 = await makeKey(0x44);
    // Sign with key1 as current
    const signer = createSignedTimestampId("sgn", { keys: [key1], allowDuplicateBrand: true });
    const id = await signer.generate();
    // key1 removed from ring — only key2 remains
    const revoked = createSignedTimestampId("sgn", { keys: [key2], allowDuplicateBrand: true });
    await expect(revoked.verify(id)).rejects.toMatchObject({ code: "verification_failed" });
  });

  // --- False-accept bound ---

  it("false-accept bound: per-verify probability scales as keyringSize / 2^40 (40-bit tag)", () => {
    const tagBits = 40;
    const keyringSize = 3;
    const falseAcceptPerVerify = keyringSize / Math.pow(2, tagBits);
    // At 10^4 verifications/second, a single-entry ring takes ~3.5 years for one expected forgery
    const secsToForgeryOneEntry = 1 / ((1 / Math.pow(2, tagBits)) * 10_000);
    expect(falseAcceptPerVerify).toBeCloseTo(keyringSize / 1_099_511_627_776, 15);
    expect(secsToForgeryOneEntry).toBeGreaterThan(365 * 24 * 3600);
  });

  // --- Construction validation ---

  it("rejects an empty keyring at construction", () => {
    let err: unknown;
    try {
      createSignedTimestampId("sgn", { keys: [] as never, allowDuplicateBrand: true });
    } catch (e) {
      err = e;
    }
    expect(isIdsError(err)).toBe(true);
    expect((err as IdsError).code).toBe("empty_keyring");
  });

  it("rejects duplicate signing keys in the keyring at construction", async () => {
    const key = await makeKey();
    let err: unknown;
    try {
      createSignedTimestampId("sgn", { keys: [key, key], allowDuplicateBrand: true });
    } catch (e) {
      err = e;
    }
    expect(isIdsError(err)).toBe(true);
    expect((err as IdsError).code).toBe("duplicate_keyring_entry");
  });

  // --- extractTimestamp ---

  it("extractTimestamp recovers the plaintext timestamp (sync, no key required)", async () => {
    const key = await makeKey();
    const codec = createSignedTimestampId("sgn", { keys: [key], allowDuplicateBrand: true });
    const date = new Date(1_700_000_000_000);
    const id = await codec.generateAt(date);
    expect(codec.extractTimestamp(id).getTime()).toBe(date.getTime());
  });

  // --- 48-bit timestamp boundary tests ---

  it("generateAt() round-trips at epoch (ms=0)", async () => {
    const key = await makeKey();
    const codec = createSignedTimestampId("sgn", {
      keys: [key],
      now: () => 0,
      rng: () => {},
      allowDuplicateBrand: true,
    });
    const id = await codec.generateAt(new Date(0));
    expect(codec.extractTimestamp(id).getTime()).toBe(0);
  });

  it("generateAt() round-trips at the 48-bit ceiling (ms=2^48-1)", async () => {
    const key = await makeKey();
    const maxMs = 2 ** 48 - 1;
    const codec = createSignedTimestampId("sgn", {
      keys: [key],
      now: () => maxMs,
      rng: () => {},
      allowDuplicateBrand: true,
    });
    const id = await codec.generateAt(new Date(maxMs));
    expect(codec.extractTimestamp(id).getTime()).toBe(maxMs);
  });

  it("generateAt() rejects pre-epoch dates", async () => {
    const key = await makeKey();
    const codec = createSignedTimestampId("sgn", { keys: [key], allowDuplicateBrand: true });
    await expect(codec.generateAt(new Date(-1))).rejects.toThrow("timestamp is negative");
  });

  it("generateAt() rejects dates that overflow 48 bits", async () => {
    const key = await makeKey();
    const codec = createSignedTimestampId("sgn", { keys: [key], allowDuplicateBrand: true });
    await expect(codec.generateAt(new Date(2 ** 48))).rejects.toThrow(
      "timestamp exceeds 48-bit range",
    );
  });

  it("generateAt() rejects an Invalid Date (NaN timestamp)", async () => {
    const key = await makeKey();
    const codec = createSignedTimestampId("sgn", { keys: [key], allowDuplicateBrand: true });
    await expect(codec.generateAt(new Date(NaN))).rejects.toThrow("timestamp is not a number");
  });

  it("minIdForTime() rejects pre-epoch dates", async () => {
    const key = await makeKey();
    const codec = createSignedTimestampId("sgn", { keys: [key], allowDuplicateBrand: true });
    expect(() => codec.minIdForTime(new Date(-1))).toThrow("timestamp is negative");
  });

  it("minIdForTime() rejects dates that overflow 48 bits", async () => {
    const key = await makeKey();
    const codec = createSignedTimestampId("sgn", { keys: [key], allowDuplicateBrand: true });
    expect(() => codec.minIdForTime(new Date(2 ** 48))).toThrow("timestamp exceeds 48-bit range");
  });

  it("minIdForTime() rejects an Invalid Date", async () => {
    const key = await makeKey();
    const codec = createSignedTimestampId("sgn", { keys: [key], allowDuplicateBrand: true });
    expect(() => codec.minIdForTime(new Date(NaN))).toThrow("timestamp is not a number");
  });

  it("maxIdForTime() rejects pre-epoch dates", async () => {
    const key = await makeKey();
    const codec = createSignedTimestampId("sgn", { keys: [key], allowDuplicateBrand: true });
    expect(() => codec.maxIdForTime(new Date(-1))).toThrow("timestamp is negative");
  });

  it("maxIdForTime() rejects dates that overflow 48 bits", async () => {
    const key = await makeKey();
    const codec = createSignedTimestampId("sgn", { keys: [key], allowDuplicateBrand: true });
    expect(() => codec.maxIdForTime(new Date(2 ** 48))).toThrow("timestamp exceeds 48-bit range");
  });

  it("maxIdForTime() rejects an Invalid Date", async () => {
    const key = await makeKey();
    const codec = createSignedTimestampId("sgn", { keys: [key], allowDuplicateBrand: true });
    expect(() => codec.maxIdForTime(new Date(NaN))).toThrow("timestamp is not a number");
  });

  // --- minIdForTime / maxIdForTime sentinels ---

  it("minIdForTime and maxIdForTime bound any ID generated at the same timestamp", async () => {
    const key = await makeKey();
    const codec = createSignedTimestampId("sgn", { keys: [key], allowDuplicateBrand: true });
    const t = new Date(1_700_000_000_000);
    const min = codec.minIdForTime(t);
    const max = codec.maxIdForTime(t);
    const id = await codec.generateAt(t);
    expect(min <= id).toBe(true);
    expect(id <= max).toBe(true);
  });

  // --- Sentinel non-verifiability ---

  it("minIdForTime sentinel is not verifiable (carries no valid tag)", async () => {
    const key = await makeKey();
    const codec = createSignedTimestampId("sgn", { keys: [key], allowDuplicateBrand: true });
    const sentinel = codec.minIdForTime(new Date(1_700_000_000_000));
    const result = await codec.safeVerify(sentinel);
    expect(result).toEqual({ ok: false, error: "verification_failed" });
  });

  it("maxIdForTime sentinel is not verifiable (carries no valid tag)", async () => {
    const key = await makeKey();
    const codec = createSignedTimestampId("sgn", { keys: [key], allowDuplicateBrand: true });
    const sentinel = codec.maxIdForTime(new Date(1_700_000_000_000));
    const result = await codec.safeVerify(sentinel);
    expect(result).toEqual({ ok: false, error: "verification_failed" });
  });

  // --- safeVerify structural parse errors ---

  it("safeVerify returns a parse error for structurally invalid input", async () => {
    const key = await makeKey();
    const codec = createSignedTimestampId("sgn", { keys: [key], allowDuplicateBrand: true });
    const result = await codec.safeVerify("not-an-id");
    expect(result).toEqual({ ok: false, error: "invalid_prefix" });
  });

  it("safeVerify returns verification_failed for tampered IDs without throwing", async () => {
    const key = await makeKey();
    const codec = createSignedTimestampId("sgn", { keys: [key], allowDuplicateBrand: true });
    const id = await codec.generate();
    const tampered = flipTagChar(id) as typeof id;
    const result = await codec.safeVerify(tampered);
    expect(result).toEqual({ ok: false, error: "verification_failed" });
  });

  // --- Structural wire methods (sync, no key) ---

  it("is, parse, safeParse work without key material (structural only)", async () => {
    const key = await makeKey();
    const codec = createSignedTimestampId("sgn", { keys: [key], allowDuplicateBrand: true });
    const id = await codec.generate();
    expect(codec.is(id)).toBe(true);
    expect(codec.parse(id.toUpperCase() as typeof id)).toBe(id);
    expect(codec.safeParse("bad")).toEqual({ ok: false, error: "invalid_prefix" });
  });

  it("toJsonSchema returns a valid JSON Schema with a canonical example", async () => {
    const key = await makeKey();
    const codec = createSignedTimestampId("sgn", { keys: [key], allowDuplicateBrand: true });
    const schema = codec.toJsonSchema();
    expect(schema.type).toBe("string");
    expect(schema.pattern).toContain("sgn_");
    expect(codec.is(schema.example)).toBe(true);
  });

  // --- Type-level checks ---

  it("SignedTimestampCodec and SafeVerifyResult types are parameterised by Brand", () => {
    type _R = SafeVerifyResult<"sgn">;
    const ok: _R = { ok: true, id: "sgn_00000000000000000000000000" as Id<"sgn"> };
    const fail: _R = { ok: false, error: "verification_failed" };
    expect(ok.ok).toBe(true);
    expect(fail.ok).toBe(false);
    // SignedTimestampCodec used as a type annotation via expectTypeOf-equivalent
    const codec: SignedTimestampCodec<"sgn"> | undefined = undefined;
    expect(codec).toBeUndefined();
  });

  // --- Golden vector ---

  it("golden vector: fixed ts + rng + key yields exact wire string", async () => {
    // key: 32 bytes of 0x42; ts: 0x123456789abc; rng: all bytes 0xab
    // The tag region (last 5 bytes of payload = base32 chars 17–24) is
    // HMAC-SHA-256 over brand ‖ ts6 ‖ rand5, truncated to 5 bytes.
    const key = await importSigningKey(new Uint8Array(32).fill(0x42));
    const codec = createSignedTimestampId("sgn", {
      keys: [key],
      now: () => 0x123456789abc,
      rng: (target) => {
        target.fill(0xab);
      },
      allowDuplicateBrand: true,
    });
    expect(await codec.generate()).toBe("sgn_28t5cy4tqjntqaxbndcwmngh5m");
  });

  // --- fast-check property tests ---

  describe("fast-check property tests", () => {
    let sharedKey: SigningKey;

    beforeAll(async () => {
      sharedKey = await importSigningKey(new Uint8Array(32).fill(0x42));
    });

    it("safeParse never throws on arbitrary input", () => {
      const codec = createSignedTimestampId("sgn", {
        keys: [sharedKey],
        allowDuplicateBrand: true,
      });
      fc.assert(
        fc.property(fc.string(), (s) => {
          codec.safeParse(s);
          return true;
        }),
      );
    });

    it("safeParse: when ok, returned id satisfies is()", () => {
      const codec = createSignedTimestampId("sgn", {
        keys: [sharedKey],
        allowDuplicateBrand: true,
      });
      fc.assert(
        fc.property(fc.string(), (s) => {
          const r = codec.safeParse(s);
          return !r.ok || codec.is(r.id);
        }),
      );
    });

    it("tamper invariant: flipping any base32 char 0–24 causes safeVerify to return verification_failed", async () => {
      const codec = createSignedTimestampId("sgn", {
        keys: [sharedKey],
        allowDuplicateBrand: true,
      });
      await fc.assert(
        fc.asyncProperty(fc.integer({ min: 0, max: 24 }), async (charIndex) => {
          const id = await codec.generate();
          const prefixLen = "sgn_".length;
          const chars = id.slice(prefixLen).split("");
          chars[charIndex] = chars[charIndex] === "0" ? "1" : "0";
          const tampered = ("sgn_" + chars.join("")) as typeof id;
          const result = await codec.safeVerify(tampered);
          return result.ok === false && result.error === "verification_failed";
        }),
      );
    });

    it("key encode/decode round-trip: encodeSigningKey → decodeSigningKey is identity for all lengths and formats", () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.uint8Array({ minLength: 16, maxLength: 16 }),
            fc.uint8Array({ minLength: 24, maxLength: 24 }),
            fc.uint8Array({ minLength: 32, maxLength: 32 }),
          ),
          fc.constantFrom("hex" as SigningKeyFormat, "base64url" as SigningKeyFormat),
          (bytes, fmt) => {
            const decoded = decodeSigningKey(encodeSigningKey(bytes, fmt), fmt);
            return decoded.length === bytes.length && decoded.every((b, i) => b === bytes[i]);
          },
        ),
      );
    });
  });
});
