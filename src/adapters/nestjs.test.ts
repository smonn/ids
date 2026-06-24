import { BadRequestException, HttpException, NotFoundException } from "@nestjs/common";
import type { ArgumentMetadata } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ParseIdPipe } from "./nestjs.js";
import { createOpaqueTimestampId, importOpaqueKey } from "../codecs/opaque/index.js";
import { createTimestampId } from "../codecs/timestamp/index.js";

const METADATA: ArgumentMetadata = { type: "param", metatype: String, data: "id" };

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
});
