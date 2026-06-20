import type { NextFunction, Request, Response } from "express";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { idParam } from "./express.js";
import { createOpaqueTimestampId, importOpaqueKey } from "./opaque.js";
import { createTimestampId } from "./timestamp.js";

function makeReq(paramName: string, value: string | undefined): Request {
  return { params: { [paramName]: value } } as unknown as Request;
}

type MockRes = {
  locals: Record<string, unknown>;
  statusCode: number;
  body: string;
  status: (code: number) => MockRes;
  send: (body: string) => void;
};

function makeRes(): MockRes {
  const res: MockRes = {
    locals: {},
    statusCode: 200,
    body: "",
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    send(b: string) {
      res.body = b;
    },
  };
  return res;
}

describe("idParam", () => {
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

    it("valid canonical param calls next and exposes canonical Id on res.locals", () => {
      const middleware = idParam("id", usr);
      const validId = usr.generate();
      const req = makeReq("id", validId);
      const res = makeRes();
      const next = vi.fn() as unknown as NextFunction;

      middleware(req, res as unknown as Response, next);

      expect(next).toHaveBeenCalledOnce();
      expect(res.locals["id"]).toBe(validId);
      expect(res.statusCode).toBe(200);
    });

    it("valid non-canonical param is normalized to canonical form before reaching handler", () => {
      const middleware = idParam("id", usr);
      const canonicalId = usr.generate();
      const nonCanonical = canonicalId.toUpperCase();
      const req = makeReq("id", nonCanonical);
      const res = makeRes();
      const next = vi.fn() as unknown as NextFunction;

      middleware(req, res as unknown as Response, next);

      expect(next).toHaveBeenCalledOnce();
      expect(res.locals["id"]).toBe(canonicalId);
    });

    it("wrong brand (invalid_prefix) returns 404", () => {
      const middleware = idParam("id", usr);
      const orgId = org.generate();
      const req = makeReq("id", orgId);
      const res = makeRes();
      const next = vi.fn() as unknown as NextFunction;

      middleware(req, res as unknown as Response, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(404);
    });

    it("malformed base32 payload (invalid_base32) returns 400", () => {
      const middleware = idParam("id", usr);
      // "usr_" prefix is correct, but payload contains "u" which is not in the
      // Crockford base32 alphabet
      const req = makeReq("id", "usr_uuuuuuuuuuuuuuuuuuuuuuuuuu");
      const res = makeRes();
      const next = vi.fn() as unknown as NextFunction;

      middleware(req, res as unknown as Response, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(400);
    });
  });

  describe("Opaque Timestamp codec", () => {
    it("works with the Opaque Timestamp codec's structural safeParse", async () => {
      const key = await importOpaqueKey(new Uint8Array(16));
      const inv = createOpaqueTimestampId("inv", { key, allowDuplicateBrand: true });
      const middleware = idParam("id", inv);

      const validId = await inv.generate();
      const req = makeReq("id", validId);
      const res = makeRes();
      const next = vi.fn() as unknown as NextFunction;

      middleware(req, res as unknown as Response, next);

      expect(next).toHaveBeenCalledOnce();
      expect(res.locals["id"]).toBe(validId);
    });

    it("wrong brand with Opaque Timestamp codec returns 404", async () => {
      const key = await importOpaqueKey(new Uint8Array(16));
      const inv = createOpaqueTimestampId("inv", { key, allowDuplicateBrand: true });
      const usr = createTimestampId("usr", { allowDuplicateBrand: true });
      const middleware = idParam("id", inv);

      const usrId = usr.generate();
      const req = makeReq("id", usrId);
      const res = makeRes();
      const next = vi.fn() as unknown as NextFunction;

      middleware(req, res as unknown as Response, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(404);
    });

    it("malformed payload with Opaque Timestamp codec returns 400", async () => {
      const key = await importOpaqueKey(new Uint8Array(16));
      const inv = createOpaqueTimestampId("inv", { key, allowDuplicateBrand: true });
      const middleware = idParam("id", inv);

      const req = makeReq("id", "inv_uuuuuuuuuuuuuuuuuuuuuuuuuu");
      const res = makeRes();
      const next = vi.fn() as unknown as NextFunction;

      middleware(req, res as unknown as Response, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(400);
    });
  });
});
