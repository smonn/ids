import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  createDigestId,
  decodeDigestKey,
  encodeDigestKey,
  IdsError,
  importDigestKey,
  isIdsError,
  type DigestCodec,
  type DigestKey,
  type DigestKeyFormat,
  type IdsErrorCode,
} from "./digest.js";
import type { Id } from "./types.js";

describe("@smonn/ids/digest re-exports", () => {
  it("exports importDigestKey as a function", () => {
    expect(typeof importDigestKey).toBe("function");
  });

  it("exports encodeDigestKey as a function", () => {
    expect(typeof encodeDigestKey).toBe("function");
  });

  it("exports decodeDigestKey as a function", () => {
    expect(typeof decodeDigestKey).toBe("function");
  });

  it("exports IdsError class", () => {
    expect(typeof IdsError).toBe("function");
    const err = new IdsError("invalid_key_length", "test");
    expect(err).toBeInstanceOf(IdsError);
  });

  it("exports isIdsError guard", () => {
    expect(typeof isIdsError).toBe("function");
    const err = new IdsError("invalid_namespace", "test");
    expect(isIdsError(err)).toBe(true);
  });

  it("DigestKeyFormat type covers hex and base64url", () => {
    const formats: DigestKeyFormat[] = ["hex", "base64url"];
    expect(formats).toHaveLength(2);
  });

  it("IdsErrorCode includes digest-key-relevant codes", () => {
    const codes: IdsErrorCode[] = [
      "invalid_key_format",
      "invalid_key_encoding",
      "invalid_key_length",
      "invalid_namespace",
    ];
    expect(codes).toHaveLength(4);
  });

  it("key helpers work end-to-end via the digest subpath", async () => {
    const raw = new Uint8Array(32).fill(0x42);
    const encoded = encodeDigestKey(raw, "hex");
    const decoded = decodeDigestKey(encoded, "hex");
    const key: DigestKey = await importDigestKey(decoded);
    expect(key).toBeDefined();
  });
});

describe("createDigestId", () => {
  let warnSilencer: ReturnType<typeof vi.spyOn>;
  beforeAll(() => {
    warnSilencer = vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterAll(() => {
    warnSilencer.mockRestore();
  });

  async function makeKey(fill = 0x42): Promise<DigestKey> {
    return importDigestKey(new Uint8Array(32).fill(fill));
  }

  // --- Tracer bullet ---

  it("digest() produces a canonical Id for the brand", async () => {
    const key = await makeKey();
    const idk = createDigestId("idk", { ns: "checkout", key });
    const id = await idk.digest("order-123");
    expect(typeof id).toBe("string");
    expect(id.startsWith("idk_")).toBe(true);
    expect(id).toHaveLength(4 + 26); // prefix (4) + 26 base32 chars
  });

  // --- Determinism ---

  it("digest() is deterministic: same material → same ID", async () => {
    const key = await makeKey();
    const idk = createDigestId("idk", { ns: "checkout", key, allowDuplicateBrand: true });
    const id1 = await idk.digest("order-123");
    const id2 = await idk.digest("order-123");
    expect(id1).toBe(id2);
  });

  it("digest() is deterministic across codec instances with same (brand, ns, key)", async () => {
    const raw = new Uint8Array(32).fill(0x42);
    const key1 = await importDigestKey(raw);
    const key2 = await importDigestKey(raw);
    const a = createDigestId("idk", { ns: "checkout", key: key1, allowDuplicateBrand: true });
    const b = createDigestId("idk", { ns: "checkout", key: key2, allowDuplicateBrand: true });
    expect(await a.digest("material")).toBe(await b.digest("material"));
  });

  // --- Namespace separation ---

  it("ns separation: same material under different ns → different IDs", async () => {
    const key = await makeKey();
    const a = createDigestId("idk", { ns: "checkout", key, allowDuplicateBrand: true });
    const b = createDigestId("idk", { ns: "profile", key, allowDuplicateBrand: true });
    const idA = await a.digest("user@example.com");
    const idB = await b.digest("user@example.com");
    expect(idA).not.toBe(idB);
  });

  // --- Key dependence ---

  it("key dependence: same (brand, ns, material) under different keys → different IDs", async () => {
    const key1 = await makeKey(0x11);
    const key2 = await makeKey(0x22);
    const a = createDigestId("idk", { ns: "checkout", key: key1, allowDuplicateBrand: true });
    const b = createDigestId("idk", { ns: "checkout", key: key2, allowDuplicateBrand: true });
    const idA = await a.digest("order-123");
    const idB = await b.digest("order-123");
    expect(idA).not.toBe(idB);
  });

  // --- Canonical output ---

  it("canonical output: is(digest(m)) returns true", async () => {
    const key = await makeKey();
    const idk = createDigestId("idk", { ns: "checkout", key, allowDuplicateBrand: true });
    const id = await idk.digest("test-material");
    expect(idk.is(id)).toBe(true);
  });

  it("canonical output: final base32 char has low 2 bits zeroed", async () => {
    const key = await makeKey();
    const idk = createDigestId("idk", { ns: "checkout", key, allowDuplicateBrand: true });
    const validFinalChars = new Set(["0", "4", "8", "c", "g", "m", "r", "w"]);
    for (let i = 0; i < 20; i++) {
      const id = await idk.digest(`material-${i}`);
      const finalChar = id[id.length - 1]!;
      expect(
        validFinalChars.has(finalChar),
        `final char '${finalChar}' must be in [048cgmrw]`,
      ).toBe(true);
    }
  });

  // --- String vs Uint8Array material ---

  it("string material and Uint8Array of its UTF-8 bytes produce the same ID", async () => {
    const key = await makeKey();
    const idk = createDigestId("idk", { ns: "checkout", key, allowDuplicateBrand: true });
    const material = "hello world";
    const bytes = new TextEncoder().encode(material);
    const fromString = await idk.digest(material);
    const fromBytes = await idk.digest(bytes);
    expect(fromString).toBe(fromBytes);
  });

  // --- One-wayness ---

  it("codec has no unwrap method", async () => {
    const key = await makeKey();
    const idk = createDigestId("idk", { ns: "checkout", key, allowDuplicateBrand: true });
    expect("unwrap" in idk).toBe(false);
  });

  it("codec has no verify method", async () => {
    const key = await makeKey();
    const idk = createDigestId("idk", { ns: "checkout", key, allowDuplicateBrand: true });
    expect("verify" in idk).toBe(false);
  });

  it("codec has no extractTimestamp method", async () => {
    const key = await makeKey();
    const idk = createDigestId("idk", { ns: "checkout", key, allowDuplicateBrand: true });
    expect("extractTimestamp" in idk).toBe(false);
  });

  // --- Wire methods ---

  it("is() returns false for non-canonical input", async () => {
    const key = await makeKey();
    const idk = createDigestId("idk", { ns: "checkout", key, allowDuplicateBrand: true });
    expect(idk.is("not-an-id")).toBe(false);
    expect(idk.is(null)).toBe(false);
    expect(idk.is(42)).toBe(false);
  });

  it("is() returns false for uppercase canonical ID (non-canonical)", async () => {
    const key = await makeKey();
    const idk = createDigestId("idk", { ns: "checkout", key, allowDuplicateBrand: true });
    const id = await idk.digest("test");
    expect(idk.is(id.toUpperCase())).toBe(false);
  });

  it("parse() returns canonical Id for valid input", async () => {
    const key = await makeKey();
    const idk = createDigestId("idk", { ns: "checkout", key, allowDuplicateBrand: true });
    const id = await idk.digest("test");
    expect(idk.parse(id)).toBe(id);
  });

  it("parse() throws IdsError invalid_id on bad input", async () => {
    const key = await makeKey();
    const idk = createDigestId("idk", { ns: "checkout", key, allowDuplicateBrand: true });
    expect(() => idk.parse("bad")).toThrowError(IdsError);
    try {
      idk.parse("bad");
    } catch (err) {
      expect(isIdsError(err)).toBe(true);
      expect((err as IdsError).code).toBe("invalid_id");
    }
  });

  it("safeParse() normalises aliases: o→0, i→1, l→1", async () => {
    const key = await makeKey();
    const idk = createDigestId("idk", { ns: "checkout", key, allowDuplicateBrand: true });

    // Scan digests until we find payloads containing each needed canonical char
    let idWith0 = "";
    let idWith1 = "";
    for (let i = 0; i < 100; i++) {
      const id = await idk.digest(`alias-search-${i}`);
      const payload = id.slice(4);
      if (!idWith0 && payload.includes("0")) idWith0 = id;
      if (!idWith1 && payload.includes("1")) idWith1 = id;
      if (idWith0 && idWith1) break;
    }
    expect(idWith0).toBeTruthy();
    expect(idWith1).toBeTruthy();

    // o→0
    const withO = "idk_" + idWith0.slice(4).replace("0", "o");
    const rO = idk.safeParse(withO);
    expect(rO.ok).toBe(true);
    if (rO.ok) expect(rO.id).toBe(idWith0);

    // i→1
    const withI = "idk_" + idWith1.slice(4).replace("1", "i");
    const rI = idk.safeParse(withI);
    expect(rI.ok).toBe(true);
    if (rI.ok) expect(rI.id).toBe(idWith1);

    // l→1
    const withL = "idk_" + idWith1.slice(4).replace("1", "l");
    const rL = idk.safeParse(withL);
    expect(rL.ok).toBe(true);
    if (rL.ok) expect(rL.id).toBe(idWith1);
  });

  it("safeParse() rejects non-zero padding bits as invalid_base32", async () => {
    const key = await makeKey();
    const idk = createDigestId("idk", { ns: "checkout", key, allowDuplicateBrand: true });
    const id = await idk.digest("test");
    // Replace final char with one that has non-zero low 2 bits
    const badFinalChars = [
      "1",
      "2",
      "3",
      "5",
      "6",
      "7",
      "9",
      "a",
      "b",
      "e",
      "f",
      "h",
      "j",
      "k",
      "n",
      "p",
      "q",
      "s",
      "t",
      "v",
      "x",
      "y",
      "z",
    ];
    const tampered = id.slice(0, -1) + badFinalChars[0]!;
    const result = idk.safeParse(tampered);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("invalid_base32");
    }
  });

  it("safeParse() returns invalid_prefix for wrong brand", async () => {
    const key = await makeKey();
    const idk = createDigestId("idk", { ns: "checkout", key, allowDuplicateBrand: true });
    const result = idk.safeParse("xyz_" + "0".repeat(26));
    expect(result).toEqual({ ok: false, error: "invalid_prefix" });
  });

  it("safeParse() returns not_string for non-string input", async () => {
    const key = await makeKey();
    const idk = createDigestId("idk", { ns: "checkout", key, allowDuplicateBrand: true });
    expect(idk.safeParse(42)).toEqual({ ok: false, error: "not_string" });
    expect(idk.safeParse(null)).toEqual({ ok: false, error: "not_string" });
  });

  it("toJsonSchema() returns a JSON Schema with the right pattern", async () => {
    const key = await makeKey();
    const idk = createDigestId("idk", { ns: "checkout", key, allowDuplicateBrand: true });
    const schema = idk.toJsonSchema();
    expect(schema.type).toBe("string");
    expect(schema.pattern).toMatch(/\^idk_/);
    expect(schema.description).toContain("idk");
  });

  it("~standard.validate() returns id on valid input", async () => {
    const key = await makeKey();
    const idk = createDigestId("idk", { ns: "checkout", key, allowDuplicateBrand: true });
    const id = await idk.digest("test");
    const result = idk["~standard"].validate(id);
    expect("value" in result && result.value).toBe(id);
  });

  it("~standard.validate() returns issues on invalid input", async () => {
    const key = await makeKey();
    const idk = createDigestId("idk", { ns: "checkout", key, allowDuplicateBrand: true });
    const result = idk["~standard"].validate("bad");
    expect("issues" in result).toBe(true);
  });

  // --- Construction guards ---

  it("throws invalid_brand for non-3-char brand", async () => {
    const key = await makeKey();
    expect(() => createDigestId("toolong" as "abc", { ns: "test", key })).toThrowError(IdsError);
    try {
      createDigestId("toolong" as "abc", { ns: "test", key });
    } catch (err) {
      expect(isIdsError(err)).toBe(true);
      expect((err as IdsError).code).toBe("invalid_brand");
    }
  });

  it("throws invalid_namespace for empty ns", async () => {
    const key = await makeKey();
    expect(() => createDigestId("idk", { ns: "", key, allowDuplicateBrand: true })).toThrowError(
      IdsError,
    );
    try {
      createDigestId("idk", { ns: "", key, allowDuplicateBrand: true });
    } catch (err) {
      expect(isIdsError(err)).toBe(true);
      expect((err as IdsError).code).toBe("invalid_namespace");
    }
  });

  it("throws invalid_namespace for whitespace-only ns", async () => {
    const key = await makeKey();
    expect(() => createDigestId("idk", { ns: "   ", key, allowDuplicateBrand: true })).toThrowError(
      IdsError,
    );
    try {
      createDigestId("idk", { ns: "   ", key, allowDuplicateBrand: true });
    } catch (err) {
      expect(isIdsError(err)).toBe(true);
      expect((err as IdsError).code).toBe("invalid_namespace");
    }
  });

  // --- Key import / encode / decode ---

  it("importDigestKey throws invalid_key_length for bad byte length", async () => {
    await expect(importDigestKey(new Uint8Array(10))).rejects.toMatchObject({
      code: "invalid_key_length",
    });
  });

  it("importDigestKey accepts 16, 24, and 32 bytes", async () => {
    await expect(importDigestKey(new Uint8Array(16))).resolves.toBeDefined();
    await expect(importDigestKey(new Uint8Array(24))).resolves.toBeDefined();
    await expect(importDigestKey(new Uint8Array(32))).resolves.toBeDefined();
  });

  it("encodeDigestKey / decodeDigestKey round-trip in hex", () => {
    const raw = new Uint8Array(32).fill(0xab);
    const encoded = encodeDigestKey(raw, "hex");
    expect(typeof encoded).toBe("string");
    const decoded = decodeDigestKey(encoded, "hex");
    expect(decoded).toEqual(raw);
  });

  it("encodeDigestKey / decodeDigestKey round-trip in base64url", () => {
    const raw = new Uint8Array(32).fill(0xcd);
    const encoded = encodeDigestKey(raw, "base64url");
    const decoded = decodeDigestKey(encoded, "base64url");
    expect(decoded).toEqual(raw);
  });

  it("encodeDigestKey throws invalid_key_format for unknown format", () => {
    const raw = new Uint8Array(32);
    expect(() => encodeDigestKey(raw, "base58" as DigestKeyFormat)).toThrowError(IdsError);
  });

  it("decodeDigestKey throws invalid_key_encoding for malformed hex", () => {
    expect(() => decodeDigestKey("not-hex!!", "hex")).toThrowError(IdsError);
  });

  // --- Type safety ---

  it("DigestCodec type has digest, is, parse, safeParse, toJsonSchema, ~standard", async () => {
    const key = await makeKey();
    const idk: DigestCodec<"idk"> = createDigestId("idk", {
      ns: "checkout",
      key,
      allowDuplicateBrand: true,
    });
    expect(typeof idk.digest).toBe("function");
    expect(typeof idk.is).toBe("function");
    expect(typeof idk.parse).toBe("function");
    expect(typeof idk.safeParse).toBe("function");
    expect(typeof idk.toJsonSchema).toBe("function");
    expect(typeof idk["~standard"]).toBe("object");
  });

  it("digest() return type is Id<Brand>", async () => {
    const key = await makeKey();
    const idk = createDigestId("idk", { ns: "checkout", key, allowDuplicateBrand: true });
    const id: Id<"idk"> = await idk.digest("test");
    expect(id).toBeDefined();
  });
});
