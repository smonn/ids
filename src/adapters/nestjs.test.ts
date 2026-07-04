import { BadRequestException, Controller, HttpException, NotFoundException } from "@nestjs/common";
import type { ArgumentMetadata } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ParseIdPipe } from "./nestjs.js";
import type { IdParamFailure } from "./nestjs.js";
import { createOpaqueTimestampId, importOpaqueKey } from "../codecs/opaque/index.js";
import { createTimestampId } from "../codecs/timestamp/index.js";
import {
  makeFailingSpyCodec,
  makeRealSignedCodec,
  makeRealWrappedCodec,
  makeSpyCodec,
  makeVerifiableSpyCodec,
  makeWrappedVerifiableSpyCodec,
} from "./test-helpers.js";

const METADATA: ArgumentMetadata = { type: "param", metatype: String, data: "id" };
const QUERY_METADATA: ArgumentMetadata = { type: "query", metatype: String, data: "id" };

describe("ParseIdPipe", () => {
  let warnSilencer: ReturnType<typeof vi.spyOn>;
  beforeAll(() => {
    warnSilencer = vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterAll(() => {
    warnSilencer.mockRestore();
  });

  describe("Timestamp codec", () => {
    const usr = createTimestampId("usr", { allowDuplicateBrand: true });
    const org = createTimestampId("org", { allowDuplicateBrand: true });

    it("valid canonical input returns canonical Id<Brand>", () => {
      const pipe = new ParseIdPipe(usr);
      const id = usr.generate();
      expect(pipe.transform(id, METADATA)).toBe(id);
    });

    it("valid non-canonical input is normalised to canonical form", () => {
      const pipe = new ParseIdPipe(usr);
      const canonical = usr.generate();
      const nonCanonical = canonical.toUpperCase();
      expect(pipe.transform(nonCanonical, METADATA)).toBe(canonical);
    });

    it("wrong brand (invalid_prefix) throws NotFoundException (status 404)", () => {
      const pipe = new ParseIdPipe(usr);
      const orgId = org.generate();
      expect(() => pipe.transform(orgId, METADATA)).toThrow(NotFoundException);
    });

    it("malformed base32 payload throws BadRequestException (status 400)", () => {
      const pipe = new ParseIdPipe(usr);
      // "usr_" prefix is correct, but "u" is not in the Crockford base32 alphabet
      expect(() => pipe.transform("usr_uuuuuuuuuuuuuuuuuuuuuuuuuu", METADATA)).toThrow(
        BadRequestException,
      );
    });

    it("status override: brand_mismatch remapped to 400 throws HttpException with status 400", () => {
      const pipe = new ParseIdPipe(usr, { status: { brand_mismatch: 400 } });
      const orgId = org.generate();
      let thrown: unknown;
      try {
        pipe.transform(orgId, METADATA);
      } catch (err) {
        thrown = err;
      }
      expect(thrown).toBeInstanceOf(HttpException);
      expect((thrown as HttpException).getStatus()).toBe(400);
    });

    it("body-shape parity: overridden-status path produces an object body, same shape as the default path", () => {
      const defaultPipe = new ParseIdPipe(usr);
      const overridePipe = new ParseIdPipe(usr, { status: { brand_mismatch: 422 } });
      const orgId = org.generate();

      let defaultThrown: unknown;
      let overrideThrown: unknown;
      try {
        defaultPipe.transform(orgId, METADATA);
      } catch (err) {
        defaultThrown = err;
      }
      try {
        overridePipe.transform(orgId, METADATA);
      } catch (err) {
        overrideThrown = err;
      }

      // Both paths must produce an object body (not a plain string)
      const defaultBody = (defaultThrown as HttpException).getResponse();
      const overrideBody = (overrideThrown as HttpException).getResponse();
      expect(typeof defaultBody).toBe("object");
      expect(typeof overrideBody).toBe("object");
      // Both bodies must have a numeric statusCode field
      expect(typeof (defaultBody as Record<string, unknown>)["statusCode"]).toBe("number");
      expect(typeof (overrideBody as Record<string, unknown>)["statusCode"]).toBe("number");
    });

    it("onError escape hatch: called with IdParamFailure and its throw propagates", () => {
      class CustomError extends Error {}
      const pipe = new ParseIdPipe(usr, {
        onError: (failure) => {
          throw new CustomError(`custom: ${failure.reason}`);
        },
      });
      const orgId = org.generate();
      expect(() => pipe.transform(orgId, METADATA)).toThrow(CustomError);
      expect(() => pipe.transform(orgId, METADATA)).toThrow("custom: brand_mismatch");
    });

    it("onError escape hatch receives IdParamFailure with correct reason and status", () => {
      const received: Array<{ reason: string; status: number }> = [];
      const pipe = new ParseIdPipe(usr, {
        onError: (failure) => {
          received.push({ reason: failure.reason, status: failure.status });
          throw new Error("stop");
        },
      });
      const orgId = org.generate();
      try {
        pipe.transform(orgId, METADATA);
      } catch {
        // expected
      }
      expect(received).toHaveLength(1);
      expect(received[0]).toEqual({ reason: "brand_mismatch", status: 404 });
    });

    it("onError supplied: fallback NotFoundException is thrown after non-throwing hook runs", () => {
      let called = false;
      const pipe = new ParseIdPipe(usr, {
        // Cast: intentionally non-throwing to test the runtime fallback — hook runs, then default exception is thrown
        onError: ((_failure: IdParamFailure) => {
          called = true;
        }) as (failure: IdParamFailure) => never,
      });
      const orgId = org.generate();
      expect(() => pipe.transform(orgId, METADATA)).toThrow(NotFoundException);
      expect(called).toBe(true);
    });
  });

  describe("Opaque Timestamp codec", () => {
    it("structural safeParse works through the pipe for a valid id", async () => {
      const key = await importOpaqueKey(new Uint8Array(16));
      const inv = createOpaqueTimestampId("inv", { key, allowDuplicateBrand: true });
      const pipe = new ParseIdPipe(inv);

      const id = await inv.generate();
      expect(pipe.transform(id, METADATA)).toBe(id);
    });

    it("wrong brand with Opaque Timestamp codec throws NotFoundException", async () => {
      const key = await importOpaqueKey(new Uint8Array(16));
      const inv = createOpaqueTimestampId("inv", { key, allowDuplicateBrand: true });
      const usr = createTimestampId("usr", { allowDuplicateBrand: true });
      const pipe = new ParseIdPipe(inv);

      const usrId = usr.generate();
      expect(() => pipe.transform(usrId, METADATA)).toThrow(NotFoundException);
    });

    it("malformed payload with Opaque Timestamp codec throws BadRequestException", async () => {
      const key = await importOpaqueKey(new Uint8Array(16));
      const inv = createOpaqueTimestampId("inv", { key, allowDuplicateBrand: true });
      const pipe = new ParseIdPipe(inv);

      expect(() => pipe.transform("inv_uuuuuuuuuuuuuuuuuuuuuuuuuu", METADATA)).toThrow(
        BadRequestException,
      );
    });
  });

  describe("safeParse-only contract (spy codec)", () => {
    it("transform calls only safeParse on the codec", () => {
      const spyCodec = makeSpyCodec("spy");
      const pipe = new ParseIdPipe(spyCodec);
      pipe.transform("any_value", METADATA);
      expect(spyCodec.safeParse).toHaveBeenCalled();
      expect(spyCodec.extractTimestamp).not.toHaveBeenCalled();
      expect(spyCodec.wrap).not.toHaveBeenCalled();
      expect(spyCodec.unwrap).not.toHaveBeenCalled();
    });
  });
});

describe("ParseIdPipe with @Query decorator (source-agnostic pipe)", () => {
  let warnSilencer: ReturnType<typeof vi.spyOn>;
  beforeAll(() => {
    warnSilencer = vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterAll(() => {
    warnSilencer.mockRestore();
  });

  const usr = createTimestampId("usr", { allowDuplicateBrand: true });
  const org = createTimestampId("org", { allowDuplicateBrand: true });

  it("valid canonical query string ID is accepted and returned as canonical Id<Brand>", () => {
    const pipe = new ParseIdPipe(usr);
    const id = usr.generate();
    // ParseIdPipe.transform is source-agnostic: it receives the value NestJS extracted
    // via @Query("id") exactly as it would via @Param("id")
    expect(pipe.transform(id, QUERY_METADATA)).toBe(id);
  });

  it("valid non-canonical query string ID is normalised to canonical form", () => {
    const pipe = new ParseIdPipe(usr);
    const canonical = usr.generate();
    const nonCanonical = canonical.toUpperCase();
    expect(pipe.transform(nonCanonical, QUERY_METADATA)).toBe(canonical);
  });

  it("brand-mismatch query string ID throws NotFoundException (status 404)", () => {
    const pipe = new ParseIdPipe(usr);
    const orgId = org.generate();
    expect(() => pipe.transform(orgId, QUERY_METADATA)).toThrow(NotFoundException);
  });

  it("malformed query string ID throws BadRequestException (status 400)", () => {
    const pipe = new ParseIdPipe(usr);
    expect(() => pipe.transform("usr_uuuuuuuuuuuuuuuuuuuuuuuuuu", QUERY_METADATA)).toThrow(
      BadRequestException,
    );
  });

  it("missing query param (undefined) throws BadRequestException (status 400)", () => {
    const pipe = new ParseIdPipe(usr);
    expect(() => pipe.transform(undefined, QUERY_METADATA)).toThrow(BadRequestException);
  });
});

describe("ParseIdPipe — NestJS testing module (integration)", () => {
  let warnSilencer: ReturnType<typeof vi.spyOn>;
  beforeAll(() => {
    warnSilencer = vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterAll(() => {
    warnSilencer.mockRestore();
  });

  const usr = createTimestampId("usr", { allowDuplicateBrand: true });
  const org = createTimestampId("org", { allowDuplicateBrand: true });

  class TestController {}
  Controller("users")(TestController);

  it("happy path: pipe resolved from TestingModule returns canonical Id", async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [TestController],
      providers: [{ provide: ParseIdPipe, useValue: new ParseIdPipe(usr) }],
    }).compile();

    const pipe = moduleRef.get(ParseIdPipe) as ParseIdPipe<"usr">;
    const id = usr.generate();
    expect(pipe.transform(id, METADATA)).toBe(id);

    await moduleRef.close();
  });

  it("error path: pipe from TestingModule throws NotFoundException for brand mismatch", async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [TestController],
      providers: [{ provide: ParseIdPipe, useValue: new ParseIdPipe(usr) }],
    }).compile();

    const pipe = moduleRef.get(ParseIdPipe) as ParseIdPipe<"usr">;
    const orgId = org.generate();
    expect(() => pipe.transform(orgId, METADATA)).toThrow(NotFoundException);

    await moduleRef.close();
  });

  it("error path: pipe from TestingModule throws BadRequestException for malformed ID", async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [TestController],
      providers: [{ provide: ParseIdPipe, useValue: new ParseIdPipe(usr) }],
    }).compile();

    const pipe = moduleRef.get(ParseIdPipe) as ParseIdPipe<"usr">;
    expect(() => pipe.transform("usr_uuuuuuuuuuuuuuuuuuuuuuuuuu", METADATA)).toThrow(
      BadRequestException,
    );

    await moduleRef.close();
  });

  it("failure-mapping: spy codec with safeParse failure throws BadRequestException", async () => {
    const failing = makeFailingSpyCodec("spy", "not_string");
    const pipe = new ParseIdPipe(failing);
    const moduleRef = await Test.createTestingModule({
      providers: [{ provide: ParseIdPipe, useValue: pipe }],
    }).compile();

    const resolvedPipe = moduleRef.get(ParseIdPipe) as typeof pipe;
    expect(() => resolvedPipe.transform("any_value", METADATA)).toThrow(BadRequestException);

    await moduleRef.close();
  });

  it("failure-mapping: spy codec with invalid_prefix failure throws NotFoundException", async () => {
    const failing = makeFailingSpyCodec("spy", "invalid_prefix");
    const pipe = new ParseIdPipe(failing);
    const moduleRef = await Test.createTestingModule({
      providers: [{ provide: ParseIdPipe, useValue: pipe }],
    }).compile();

    const resolvedPipe = moduleRef.get(ParseIdPipe) as typeof pipe;
    expect(() => resolvedPipe.transform("any_value", METADATA)).toThrow(NotFoundException);

    await moduleRef.close();
  });
});

describe("ParseIdPipe verify option", () => {
  let warnSilencer: ReturnType<typeof vi.spyOn>;
  beforeAll(() => {
    warnSilencer = vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterAll(() => {
    warnSilencer.mockRestore();
  });

  const METADATA: ArgumentMetadata = { type: "param", metatype: String, data: "id" };

  it("forged-tag (safeVerify returns fail) → BadRequestException (async)", async () => {
    const spyCodec = makeVerifiableSpyCodec("spy", "fail");
    const pipe = new ParseIdPipe(spyCodec, { verify: true });
    await expect(pipe.transform("spy_00000000000000000000000000", METADATA)).rejects.toThrow(
      BadRequestException,
    );
  });

  it("valid tag (safeVerify returns ok) → canonical Id<Brand> resolved (async)", async () => {
    const spyCodec = makeVerifiableSpyCodec("spy", "ok");
    const pipe = new ParseIdPipe(spyCodec, { verify: true });
    const result = await pipe.transform("spy_00000000000000000000000000", METADATA);
    expect(result).toBeDefined();
  });

  it("without verify, transform is sync and safeVerify is never called", () => {
    const spyCodec = makeVerifiableSpyCodec("spy", "ok");
    const pipe = new ParseIdPipe(spyCodec);
    const result = pipe.transform("spy_00000000000000000000000000", METADATA);
    expect(result).not.toBeInstanceOf(Promise);
    expect(spyCodec.safeVerify).not.toHaveBeenCalled();
  });

  it("real Signed Timestamp codec: forged-tag ID rejected with verify: true", async () => {
    const signed = await makeRealSignedCodec("sgn");
    const validId = await signed.generate();
    const forged = validId.slice(0, 5) + (validId[5] === "0" ? "1" : "0") + validId.slice(6);

    const pipe = new ParseIdPipe(signed, { verify: true });
    await expect(pipe.transform(forged, METADATA)).rejects.toThrow(BadRequestException);
  });

  it("real Signed Timestamp codec: HMAC-valid ID accepted with verify: true", async () => {
    const signed = await makeRealSignedCodec("sgn");
    const validId = await signed.generate();

    const pipe = new ParseIdPipe(signed, { verify: true });
    const result = await pipe.transform(validId, METADATA);
    expect(result).toBeDefined();
  });

  it("real Wrapped key codec: forged-tag ID rejected with verify: true", async () => {
    const inv = await makeRealWrappedCodec("inv");
    const validId = await inv.wrap(7);
    // Tamper a non-final payload char (index 4, right after "inv_") so the id stays
    // structurally valid — the rejection must come from verification, not a parse failure.
    const forged = validId.slice(0, 4) + (validId[4] === "0" ? "1" : "0") + validId.slice(5);

    const pipe = new ParseIdPipe(inv, { verify: true });
    await expect(pipe.transform(forged, METADATA)).rejects.toThrow(BadRequestException);
  });

  it("real Wrapped key codec: structurally malformed input rejected via parse channel", async () => {
    const inv = await makeRealWrappedCodec("inv");
    // "u" is not in the Crockford base32 alphabet → invalid_base32 → malformed. The parse
    // failure short-circuits BEFORE the async verify branch, so transform throws synchronously.
    const pipe = new ParseIdPipe(inv, { verify: true });
    expect(() => pipe.transform("inv_uuuuuuuuuuuuuuuuuuuuuuuuuu", METADATA)).toThrow(
      BadRequestException,
    );
  });

  it("real Wrapped key codec: tag-valid ID accepted with verify: true", async () => {
    const inv = await makeRealWrappedCodec("inv");
    const validId = await inv.wrap(7);

    const pipe = new ParseIdPipe(inv, { verify: true });
    const result = await pipe.transform(validId, METADATA);
    expect(result).toBe(validId);
  });

  it("Wrapped key codec: verify: true calls safeVerify (spy)", async () => {
    const spyCodec = makeWrappedVerifiableSpyCodec("inv", "ok");
    const pipe = new ParseIdPipe(spyCodec, { verify: true });
    await pipe.transform("inv_00000000000000000000000000", METADATA);
    expect(spyCodec.safeVerify).toHaveBeenCalled();
  });

  it("TypeScript rejects verify: true with non-verifiable codec; fail-closed at runtime (TypeError)", () => {
    const plain = makeSpyCodec("tst");
    // @ts-expect-error — plain codec lacks safeVerify; verify: true requires IdVerifiableCodec
    const pipe = new ParseIdPipe(plain, { verify: true });
    expect(() => pipe.transform("tst_00000000000000000000000000", METADATA)).toThrow(TypeError);
  });

  it("verify: true with onError hook: hook is called and its throw propagates", async () => {
    const spyCodec = makeVerifiableSpyCodec("spy", "fail");
    const onError = vi.fn((failure: unknown) => {
      throw new BadRequestException(`custom: ${(failure as { reason: string }).reason}`);
    });
    const pipe = new ParseIdPipe(spyCodec, { verify: true, onError: onError as never });
    await expect(pipe.transform("spy_00000000000000000000000000", METADATA)).rejects.toThrow(
      "custom: malformed",
    );
    expect(onError).toHaveBeenCalledOnce();
  });

  it("verify: true with non-throwing onError hook: fallback BadRequestException is thrown after hook runs", async () => {
    const spyCodec = makeVerifiableSpyCodec("spy", "fail");
    let called = false;
    const pipe = new ParseIdPipe(spyCodec, {
      verify: true,
      onError: ((_failure: IdParamFailure) => {
        called = true;
      }) as (failure: IdParamFailure) => never,
    });
    await expect(pipe.transform("spy_00000000000000000000000000", METADATA)).rejects.toThrow(
      BadRequestException,
    );
    expect(called).toBe(true);
  });

  it("verify: true with non-400 malformed status → HttpException with that status", async () => {
    const spyCodec = makeVerifiableSpyCodec("spy", "fail");
    const pipe = new ParseIdPipe(spyCodec, { verify: true, status: { malformed: 422 } });
    await expect(pipe.transform("spy_00000000000000000000000000", METADATA)).rejects.toThrow(
      HttpException,
    );
  });
});
