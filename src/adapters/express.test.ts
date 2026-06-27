import { fromAny } from "@total-typescript/shoehorn";
import express from "express";
import type { NextFunction, Request } from "express";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { IdParamError, idParam, idQuery } from "./express.js";
import { createOpaqueTimestampId, importOpaqueKey } from "../codecs/opaque/index.js";
import { createTimestampId } from "../codecs/timestamp/index.js";
import { makeFailingSpyCodec, makeSpyCodec } from "./test-helpers.js";

function makeReq(paramName: string, value: string | undefined): Request {
  return fromAny({ params: { [paramName]: value } });
}

function makeQueryReq(queryName: string, value: string | undefined): Request {
  return fromAny({ query: { [queryName]: value } });
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
      const next: NextFunction = fromAny(vi.fn());

      middleware(req, fromAny(res), next);

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
      const next: NextFunction = fromAny(vi.fn());

      middleware(req, fromAny(res), next);

      expect(next).toHaveBeenCalledOnce();
      expect(next).toHaveBeenCalledWith();
      expect(res.locals["id"]).toBe(canonicalId);
    });

    it("wrong brand (invalid_prefix) forwards IdParamError with status 404 to next(err)", () => {
      const middleware = idParam("id", usr);
      const orgId = org.generate();
      const req = makeReq("id", orgId);
      const res = makeRes();
      const next: NextFunction = fromAny(vi.fn());

      middleware(req, fromAny(res), next);

      expect(next).toHaveBeenCalledOnce();
      const err: IdParamError = fromAny(vi.mocked(next).mock.calls[0]?.[0]);
      expect(err).toBeInstanceOf(IdParamError);
      expect(err.reason).toBe("brand_mismatch");
      expect(err.status).toBe(404);
      expect(res.statusCode).toBe(200);
    });

    it("malformed base32 payload (invalid_base32) forwards IdParamError with status 400 to next(err)", () => {
      const middleware = idParam("id", usr);
      // "usr_" prefix is correct, but payload contains "u" which is not in the
      // Crockford base32 alphabet
      const req = makeReq("id", "usr_uuuuuuuuuuuuuuuuuuuuuuuuuu");
      const res = makeRes();
      const next: NextFunction = fromAny(vi.fn());

      middleware(req, fromAny(res), next);

      expect(next).toHaveBeenCalledOnce();
      const err: IdParamError = fromAny(vi.mocked(next).mock.calls[0]?.[0]);
      expect(err).toBeInstanceOf(IdParamError);
      expect(err.reason).toBe("malformed");
      expect(err.status).toBe(400);
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
      const next: NextFunction = fromAny(vi.fn());

      middleware(req, fromAny(res), next);

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
      const next: NextFunction = fromAny(vi.fn());

      middleware(req, fromAny(res), next);

      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(400);
      expect(res.body).toBe(JSON.stringify({ error: "malformed" }));
    });

    it("status remap: brand_mismatch remapped to 400 in forwarded error", () => {
      const middleware = idParam("id", usr, { status: { brand_mismatch: 400 } });
      const orgId = org.generate();
      const req = makeReq("id", orgId);
      const res = makeRes();
      const next: NextFunction = fromAny(vi.fn());

      middleware(req, fromAny(res), next);

      expect(next).toHaveBeenCalledOnce();
      const err: IdParamError = fromAny(vi.mocked(next).mock.calls[0]?.[0]);
      expect(err).toBeInstanceOf(IdParamError);
      expect(err.reason).toBe("brand_mismatch");
      expect(err.status).toBe(400);
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
      const next: NextFunction = fromAny(vi.fn());

      middleware(req, fromAny(res), next);

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
      const next: NextFunction = fromAny(vi.fn());

      middleware(req, fromAny(res), next);

      expect(next).toHaveBeenCalledOnce();
      const err: IdParamError = fromAny(vi.mocked(next).mock.calls[0]?.[0]);
      expect(err).toBeInstanceOf(IdParamError);
      expect(err.reason).toBe("brand_mismatch");
      expect(err.status).toBe(404);
    });

    it("malformed payload with Opaque Timestamp codec forwards IdParamError with status 400 to next(err)", async () => {
      const key = await importOpaqueKey(new Uint8Array(16));
      const inv = createOpaqueTimestampId("inv", { key, allowDuplicateBrand: true });
      const middleware = idParam("id", inv);

      const req = makeReq("id", "inv_uuuuuuuuuuuuuuuuuuuuuuuuuu");
      const res = makeRes();
      const next: NextFunction = fromAny(vi.fn());

      middleware(req, fromAny(res), next);

      expect(next).toHaveBeenCalledOnce();
      const err: IdParamError = fromAny(vi.mocked(next).mock.calls[0]?.[0]);
      expect(err).toBeInstanceOf(IdParamError);
      expect(err.reason).toBe("malformed");
      expect(err.status).toBe(400);
    });
  });

  describe("safeParse-only contract (spy codec)", () => {
    it("middleware calls only safeParse on the codec", () => {
      const spyCodec = makeSpyCodec("spy");
      const middleware = idParam("id", spyCodec);
      const req = makeReq("id", "any_value");
      const res = makeRes();
      const next: NextFunction = fromAny(vi.fn());
      middleware(req, fromAny(res), next);
      expect(spyCodec.safeParse).toHaveBeenCalled();
      expect(spyCodec.extractTimestamp).not.toHaveBeenCalled();
      expect(spyCodec.wrap).not.toHaveBeenCalled();
      expect(spyCodec.unwrap).not.toHaveBeenCalled();
    });
  });
});

describe("idQuery", () => {
  let warnSilencer: ReturnType<typeof vi.spyOn>;
  beforeAll(() => {
    warnSilencer = vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterAll(() => {
    warnSilencer.mockRestore();
  });

  const usr = createTimestampId("usr", { allowDuplicateBrand: true });
  const org = createTimestampId("org", { allowDuplicateBrand: true });

  it("valid canonical query param calls next and exposes canonical Id on res.locals", () => {
    const middleware = idQuery("userId", usr);
    const validId = usr.generate();
    const req = makeQueryReq("userId", validId);
    const res = makeRes();
    const next: NextFunction = fromAny(vi.fn());

    middleware(req, fromAny(res), next);

    expect(next).toHaveBeenCalledOnce();
    expect(next).toHaveBeenCalledWith();
    expect(res.locals["userId"]).toBe(validId);
    expect(res.statusCode).toBe(200);
  });

  it("valid non-canonical query param is normalized to canonical form before reaching handler", () => {
    const middleware = idQuery("userId", usr);
    const canonicalId = usr.generate();
    const nonCanonical = canonicalId.toUpperCase();
    const req = makeQueryReq("userId", nonCanonical);
    const res = makeRes();
    const next: NextFunction = fromAny(vi.fn());

    middleware(req, fromAny(res), next);

    expect(next).toHaveBeenCalledOnce();
    expect(next).toHaveBeenCalledWith();
    expect(res.locals["userId"]).toBe(canonicalId);
  });

  it("wrong brand (invalid_prefix) forwards IdParamError with status 404 to next(err)", () => {
    const middleware = idQuery("userId", usr);
    const orgId = org.generate();
    const req = makeQueryReq("userId", orgId);
    const res = makeRes();
    const next: NextFunction = fromAny(vi.fn());

    middleware(req, fromAny(res), next);

    expect(next).toHaveBeenCalledOnce();
    const err: IdParamError = fromAny(vi.mocked(next).mock.calls[0]?.[0]);
    expect(err).toBeInstanceOf(IdParamError);
    expect(err.reason).toBe("brand_mismatch");
    expect(err.status).toBe(404);
    expect(res.statusCode).toBe(200);
  });

  it("malformed base32 payload (invalid_base32) forwards IdParamError with status 400 to next(err)", () => {
    const middleware = idQuery("userId", usr);
    const req = makeQueryReq("userId", "usr_uuuuuuuuuuuuuuuuuuuuuuuuuu");
    const res = makeRes();
    const next: NextFunction = fromAny(vi.fn());

    middleware(req, fromAny(res), next);

    expect(next).toHaveBeenCalledOnce();
    const err: IdParamError = fromAny(vi.mocked(next).mock.calls[0]?.[0]);
    expect(err).toBeInstanceOf(IdParamError);
    expect(err.reason).toBe("malformed");
    expect(err.status).toBe(400);
    expect(res.statusCode).toBe(200);
  });

  it("missing query param (undefined) forwards IdParamError with status 400 to next(err)", () => {
    const middleware = idQuery("userId", usr);
    const req = makeQueryReq("userId", undefined);
    const res = makeRes();
    const next: NextFunction = fromAny(vi.fn());

    middleware(req, fromAny(res), next);

    expect(next).toHaveBeenCalledOnce();
    const err: IdParamError = fromAny(vi.mocked(next).mock.calls[0]?.[0]);
    expect(err).toBeInstanceOf(IdParamError);
    expect(err.reason).toBe("malformed");
    expect(err.status).toBe(400);
  });

  it("onError override: consumer fully owns the response for brand mismatch", () => {
    const middleware = idQuery("userId", usr, {
      onError: (failure, _req, res) => {
        res.status(failure.status).json({ error: failure.reason });
      },
    });
    const orgId = org.generate();
    const req = makeQueryReq("userId", orgId);
    const res = makeRes();
    const next: NextFunction = fromAny(vi.fn());

    middleware(req, fromAny(res), next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(404);
    expect(res.body).toBe(JSON.stringify({ error: "brand_mismatch" }));
  });

  it("onError override: consumer fully owns the response for malformed ID", () => {
    const middleware = idQuery("userId", usr, {
      onError: (failure, _req, res) => {
        res.status(failure.status).json({ error: failure.reason });
      },
    });
    const req = makeQueryReq("userId", "usr_uuuuuuuuuuuuuuuuuuuuuuuuuu");
    const res = makeRes();
    const next: NextFunction = fromAny(vi.fn());

    middleware(req, fromAny(res), next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
    expect(res.body).toBe(JSON.stringify({ error: "malformed" }));
  });

  it("status remap: brand_mismatch remapped to 400 in forwarded error", () => {
    const middleware = idQuery("userId", usr, { status: { brand_mismatch: 400 } });
    const orgId = org.generate();
    const req = makeQueryReq("userId", orgId);
    const res = makeRes();
    const next: NextFunction = fromAny(vi.fn());

    middleware(req, fromAny(res), next);

    expect(next).toHaveBeenCalledOnce();
    const err: IdParamError = fromAny(vi.mocked(next).mock.calls[0]?.[0]);
    expect(err).toBeInstanceOf(IdParamError);
    expect(err.reason).toBe("brand_mismatch");
    expect(err.status).toBe(400);
  });

  describe("safeParse-only contract (spy codec)", () => {
    it("middleware calls only safeParse on the codec", () => {
      const spyCodec = makeSpyCodec("spy");
      const middleware = idQuery("id", spyCodec);
      const req = makeQueryReq("id", "any_value");
      const res = makeRes();
      const next: NextFunction = fromAny(vi.fn());
      middleware(req, fromAny(res), next);
      expect(spyCodec.safeParse).toHaveBeenCalled();
      expect(spyCodec.extractTimestamp).not.toHaveBeenCalled();
      expect(spyCodec.wrap).not.toHaveBeenCalled();
      expect(spyCodec.unwrap).not.toHaveBeenCalled();
    });
  });

  describe("failure-mapping (spy codec)", () => {
    it("safeParse failure from spy codec maps to malformed/400 and calls next(err)", () => {
      const failing = makeFailingSpyCodec("spy", "not_string");
      const middleware = idQuery("id", failing);
      const req = makeQueryReq("id", "any_value");
      const res = makeRes();
      const next: NextFunction = fromAny(vi.fn());
      middleware(req, fromAny(res), next);
      expect(next).toHaveBeenCalledOnce();
      const err: IdParamError = fromAny(vi.mocked(next).mock.calls[0]?.[0]);
      expect(err).toBeInstanceOf(IdParamError);
      expect(err.reason).toBe("malformed");
      expect(err.status).toBe(400);
    });

    it("invalid_prefix failure from spy codec maps to brand_mismatch/404 and calls next(err)", () => {
      const failing = makeFailingSpyCodec("spy", "invalid_prefix");
      const middleware = idQuery("id", failing);
      const req = makeQueryReq("id", "any_value");
      const res = makeRes();
      const next: NextFunction = fromAny(vi.fn());
      middleware(req, fromAny(res), next);
      expect(next).toHaveBeenCalledOnce();
      const err: IdParamError = fromAny(vi.mocked(next).mock.calls[0]?.[0]);
      expect(err).toBeInstanceOf(IdParamError);
      expect(err.reason).toBe("brand_mismatch");
      expect(err.status).toBe(404);
    });
  });
});

describe("idParam / idQuery — real express() app (integration)", () => {
  const usr = createTimestampId("usr", { allowDuplicateBrand: true });
  const org = createTimestampId("org", { allowDuplicateBrand: true });

  let origin: string;
  let server: ReturnType<typeof createServer>;

  beforeAll(() => {
    const app = express();

    app.get("/users/:id", idParam("id", usr), (_req, res) => {
      res.json({ id: res.locals["id"] });
    });
    app.get("/search", idQuery("userId", usr), (_req, res) => {
      res.json({ id: res.locals["userId"] });
    });
    app.get("/spy/:id", idParam("id", makeFailingSpyCodec("spy", "not_string")), (_req, res) => {
      res.json({ ok: true });
    });

    app.use((err: unknown, _req: Request, res: express.Response, _next: NextFunction): void => {
      const e = err as IdParamError;
      res.status(e.status).json({ error: e.reason });
    });

    server = createServer(app);
    return new Promise<void>((resolve) => {
      server.listen(0, () => {
        const addr = server.address() as AddressInfo;
        origin = `http://localhost:${addr.port}`;
        resolve();
      });
    });
  });

  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it("idParam happy path: real HTTP GET returns 200 with canonical Id", async () => {
    const id = usr.generate();
    const res = await fetch(`${origin}/users/${id}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string };
    expect(body.id).toBe(id);
  });

  it("idParam error path: wrong brand returns 404 with brand_mismatch", async () => {
    const orgId = org.generate();
    const res = await fetch(`${origin}/users/${orgId}`);
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("brand_mismatch");
  });

  it("idParam error path: malformed ID returns 400 with malformed", async () => {
    const res = await fetch(`${origin}/users/usr_uuuuuuuuuuuuuuuuuuuuuuuuuu`);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("malformed");
  });

  it("idQuery happy path: real HTTP GET with query param returns 200 with canonical Id", async () => {
    const id = usr.generate();
    const res = await fetch(`${origin}/search?userId=${id}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string };
    expect(body.id).toBe(id);
  });

  it("idQuery error path: wrong brand in query param returns 404", async () => {
    const orgId = org.generate();
    const res = await fetch(`${origin}/search?userId=${orgId}`);
    expect(res.status).toBe(404);
  });

  it("failure-mapping: safeParse failure from spy codec returns 400 via real HTTP", async () => {
    const res = await fetch(`${origin}/spy/anything`);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("malformed");
  });
});
