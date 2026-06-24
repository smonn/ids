import type { NextFunction, Request, Response } from "express";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { IdParamError, idParam } from "./express.js";
import { createOpaqueTimestampId, importOpaqueKey } from "../codecs/opaque/index.js";
import { createTimestampId } from "../codecs/timestamp/index.js";

function makeReq(paramName: string, value: string | undefined): Request {
  return { params: { [paramName]: value } } as unknown as Request;
}

type MockRes = {
  locals: Record<string, unknown>;
  statusCode: number;
  body: string;
  status: (code: number) => MockRes;
  send: (body: string) => void;
  json: (body: unknown) => void;
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
    json(b: unknown) {
      res.body = JSON.stringify(b);
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
      expect(next).toHaveBeenCalledWith();
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
      expect(next).toHaveBeenCalledWith();
      expect(res.locals["id"]).toBe(canonicalId);
    });

    it("wrong brand (invalid_prefix) forwards IdParamError with status 404 to next(err)", () => {
      const middleware = idParam("id", usr);
      const orgId = org.generate();
      const req = makeReq("id", orgId);
      const res = makeRes();
      const next = vi.fn() as unknown as NextFunction;

      middleware(req, res as unknown as Response, next);

      expect(next).toHaveBeenCalledOnce();
      const err = vi.mocked(next).mock.calls[0]?.[0];
      expect(err).toBeInstanceOf(IdParamError);
      expect((err as unknown as IdParamError).reason).toBe("brand_mismatch");
      expect((err as unknown as IdParamError).status).toBe(404);
      expect(res.statusCode).toBe(200);
    });

    it("malformed base32 payload (invalid_base32) forwards IdParamError with status 400 to next(err)", () => {
      const middleware = idParam("id", usr);
      // "usr_" prefix is correct, but payload contains "u" which is not in the
      // Crockford base32 alphabet
      const req = makeReq("id", "usr_uuuuuuuuuuuuuuuuuuuuuuuuuu");
      const res = makeRes();
      const next = vi.fn() as unknown as NextFunction;

      middleware(req, res as unknown as Response, next);

      expect(next).toHaveBeenCalledOnce();
      const err = vi.mocked(next).mock.calls[0]?.[0];
      expect(err).toBeInstanceOf(IdParamError);
      expect((err as unknown as IdParamError).reason).toBe("malformed");
      expect((err as unknown as IdParamError).status).toBe(400);
      expect(res.statusCode).toBe(200);
    });

    it("onError override: consumer fully owns the response for brand mismatch", () => {
      const middleware = idParam("id", usr, {
        onError: (failure, _req, res) => {
          res.status(failure.status).json({ error: failure.reason });
        },
      });
      const orgId = org.generate();
      const req = makeReq("id", orgId);
      const res = makeRes();
      const next = vi.fn() as unknown as NextFunction;

      middleware(req, res as unknown as Response, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(404);
      expect(res.body).toBe(JSON.stringify({ error: "brand_mismatch" }));
    });

    it("onError override: consumer fully owns the response for malformed ID", () => {
      const middleware = idParam("id", usr, {
        onError: (failure, _req, res) => {
          res.status(failure.status).json({ error: failure.reason });
        },
      });
      const req = makeReq("id", "usr_uuuuuuuuuuuuuuuuuuuuuuuuuu");
      const res = makeRes();
      const next = vi.fn() as unknown as NextFunction;

      middleware(req, res as unknown as Response, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(400);
      expect(res.body).toBe(JSON.stringify({ error: "malformed" }));
    });

    it("status remap: brand_mismatch remapped to 400 in forwarded error", () => {
      const middleware = idParam("id", usr, { status: { brand_mismatch: 400 } });
      const orgId = org.generate();
      const req = makeReq("id", orgId);
      const res = makeRes();
      const next = vi.fn() as unknown as NextFunction;

      middleware(req, res as unknown as Response, next);

      expect(next).toHaveBeenCalledOnce();
      const err = vi.mocked(next).mock.calls[0]?.[0];
      expect(err).toBeInstanceOf(IdParamError);
      expect((err as unknown as IdParamError).reason).toBe("brand_mismatch");
      expect((err as unknown as IdParamError).status).toBe(400);
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
      expect(next).toHaveBeenCalledWith();
      expect(res.locals["id"]).toBe(validId);
    });

    it("wrong brand with Opaque Timestamp codec forwards IdParamError with status 404 to next(err)", async () => {
      const key = await importOpaqueKey(new Uint8Array(16));
      const inv = createOpaqueTimestampId("inv", { key, allowDuplicateBrand: true });
      const usr = createTimestampId("usr", { allowDuplicateBrand: true });
      const middleware = idParam("id", inv);

      const usrId = usr.generate();
      const req = makeReq("id", usrId);
      const res = makeRes();
      const next = vi.fn() as unknown as NextFunction;

      middleware(req, res as unknown as Response, next);

      expect(next).toHaveBeenCalledOnce();
      const err = vi.mocked(next).mock.calls[0]?.[0];
      expect(err).toBeInstanceOf(IdParamError);
      expect((err as unknown as IdParamError).reason).toBe("brand_mismatch");
      expect((err as unknown as IdParamError).status).toBe(404);
    });

    it("malformed payload with Opaque Timestamp codec forwards IdParamError with status 400 to next(err)", async () => {
      const key = await importOpaqueKey(new Uint8Array(16));
      const inv = createOpaqueTimestampId("inv", { key, allowDuplicateBrand: true });
      const middleware = idParam("id", inv);

      const req = makeReq("id", "inv_uuuuuuuuuuuuuuuuuuuuuuuuuu");
      const res = makeRes();
      const next = vi.fn() as unknown as NextFunction;

      middleware(req, res as unknown as Response, next);

      expect(next).toHaveBeenCalledOnce();
      const err = vi.mocked(next).mock.calls[0]?.[0];
      expect(err).toBeInstanceOf(IdParamError);
      expect((err as unknown as IdParamError).reason).toBe("malformed");
      expect((err as unknown as IdParamError).status).toBe(400);
    });
  });
});
