import { fromAny } from "@total-typescript/shoehorn";
import Fastify from "fastify";
import type { FastifyReply, FastifyRequest } from "fastify";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { IdParamError, idParam, idQuery } from "./fastify.js";
import type { IdParamFailure } from "./fastify.js";
import { createOpaqueTimestampId, importOpaqueKey } from "../codecs/opaque/index.js";
import { createReverseTimestampId } from "../codecs/reverse/index.js";
import { createTimestampId } from "../codecs/timestamp/index.js";
import {
  makeFailingSpyCodec,
  makeRealSignedCodec,
  makeRealWrappedCodec,
  makeSpyCodec,
  makeVerifiableSpyCodec,
  makeWrappedVerifiableSpyCodec,
} from "./test-helpers.js";

type MockRequest = {
  params: Record<string, unknown>;
};

type MockQueryRequest = {
  query: Record<string, unknown>;
};

function makeReq(paramName: string, value: string | undefined): MockRequest {
  return { params: { [paramName]: value } };
}

function makeQueryReq(queryName: string, value: string | undefined): MockQueryRequest {
  return { query: { [queryName]: value } };
}

function asReq<T extends FastifyRequest = FastifyRequest>(req: MockRequest): T {
  return fromAny(req);
}

function asQueryReq<T extends FastifyRequest = FastifyRequest>(req: MockQueryRequest): T {
  return fromAny(req);
}

function asReply(): FastifyReply {
  const mock = {
    sent: false,
    statusCode: 200,
    status(code: number) {
      mock.statusCode = code;
      return mock;
    },
    send(_body?: unknown) {
      mock.sent = true;
      return mock;
    },
  };
  return fromAny(mock);
}

async function catchError(fn: () => Promise<void>): Promise<unknown> {
  try {
    await fn();
    return undefined;
  } catch (e) {
    return e;
  }
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

    it("valid canonical param stores canonical Id on request.params and resolves", async () => {
      const handler = idParam("id", usr);
      const validId = usr.generate();
      const req = makeReq("id", validId);

      await handler(asReq(req), asReply());

      expect(req.params["id"]).toBe(validId);
    });

    it("valid non-canonical param is normalized to canonical form in request.params", async () => {
      const handler = idParam("id", usr);
      const canonicalId = usr.generate();
      const nonCanonical = canonicalId.toUpperCase();
      const req = makeReq("id", nonCanonical);

      await handler(asReq(req), asReply());

      expect(req.params["id"]).toBe(canonicalId);
    });

    it("wrong brand (invalid_prefix) throws IdParamError with reason=brand_mismatch and statusCode=404", async () => {
      const handler = idParam("id", usr);
      const req = makeReq("id", org.generate());

      const err = await catchError(() => handler(asReq(req), asReply()));

      expect(err).toBeInstanceOf(IdParamError);
      expect((err as IdParamError).reason).toBe("brand_mismatch");
      expect((err as IdParamError).statusCode).toBe(404);
    });

    it("malformed base32 payload (invalid_base32) throws IdParamError with reason=malformed and statusCode=400", async () => {
      const handler = idParam("id", usr);
      // "usr_" prefix is correct, but payload contains "u" which is not in the
      // Crockford base32 alphabet
      const req = makeReq("id", "usr_uuuuuuuuuuuuuuuuuuuuuuuuuu");

      const err = await catchError(() => handler(asReq(req), asReply()));

      expect(err).toBeInstanceOf(IdParamError);
      expect((err as IdParamError).reason).toBe("malformed");
      expect((err as IdParamError).statusCode).toBe(400);
    });

    it("undefined param (not_string path) throws IdParamError with reason=malformed and statusCode=400", async () => {
      const handler = idParam("id", usr);
      const req = makeReq("id", undefined);

      const err = await catchError(() => handler(asReq(req), asReply()));

      expect(err).toBeInstanceOf(IdParamError);
      expect((err as IdParamError).reason).toBe("malformed");
      expect((err as IdParamError).statusCode).toBe(400);
    });

    it("onError log-only: hook is called with brand_mismatch failure, then IdParamError is thrown", async () => {
      const captured: IdParamFailure[] = [];
      const handler = idParam("id", usr, {
        onError: (failure) => {
          captured.push(failure);
        },
      });
      const req = makeReq("id", org.generate());

      const err = await catchError(() => handler(asReq(req), asReply()));

      expect(captured).toHaveLength(1);
      expect(captured[0]?.reason).toBe("brand_mismatch");
      expect(captured[0]?.status).toBe(404);
      expect(err).toBeInstanceOf(IdParamError);
      expect((err as IdParamError).reason).toBe("brand_mismatch");
      expect((err as IdParamError).statusCode).toBe(404);
    });

    it("onError log-only: hook is called with malformed failure, then IdParamError is thrown", async () => {
      const captured: IdParamFailure[] = [];
      const handler = idParam("id", usr, {
        onError: (failure) => {
          captured.push(failure);
        },
      });
      const req = makeReq("id", "usr_uuuuuuuuuuuuuuuuuuuuuuuuuu");

      const err = await catchError(() => handler(asReq(req), asReply()));

      expect(captured).toHaveLength(1);
      expect(captured[0]?.reason).toBe("malformed");
      expect(captured[0]?.status).toBe(400);
      expect(err).toBeInstanceOf(IdParamError);
      expect((err as IdParamError).reason).toBe("malformed");
      expect((err as IdParamError).statusCode).toBe(400);
    });

    it("onError log-only: throws IdParamError after hook returns without sending a reply", async () => {
      const onError = vi.fn();
      const handler = idParam("id", usr, { onError });
      const req = makeReq("id", org.generate());

      const err = await catchError(() => handler(asReq(req), asReply()));

      expect(onError).toHaveBeenCalledOnce();
      expect(err).toBeInstanceOf(IdParamError);
      expect((err as IdParamError).reason).toBe("brand_mismatch");
      expect((err as IdParamError).statusCode).toBe(404);
    });

    it("onError responding hook: adapter does not throw when hook sends a reply", async () => {
      const handler = idParam("id", usr, {
        onError: (failure, _request, reply) => {
          reply.status(failure.status).send({ error: failure.reason });
        },
      });
      const req = makeReq("id", org.generate());

      const err = await catchError(() => handler(asReq(req), asReply()));

      expect(err).toBeUndefined();
    });

    it("status remap: brand_mismatch remapped to 400 in thrown IdParamError", async () => {
      const handler = idParam("id", usr, { status: { brand_mismatch: 400 } });
      const req = makeReq("id", org.generate());

      const err = await catchError(() => handler(asReq(req), asReply()));

      expect(err).toBeInstanceOf(IdParamError);
      expect((err as IdParamError).reason).toBe("brand_mismatch");
      expect((err as IdParamError).statusCode).toBe(400);
    });

    it("status remap: remapped status is passed to onError failure object and propagated in fallback IdParamError", async () => {
      const captured: IdParamFailure[] = [];
      const handler = idParam("id", usr, {
        status: { malformed: 422 },
        onError: (failure) => {
          captured.push(failure);
        },
      });
      const req = makeReq("id", "usr_uuuuuuuuuuuuuuuuuuuuuuuuuu");

      const err = await catchError(() => handler(asReq(req), asReply()));

      expect(captured[0]?.status).toBe(422);
      expect(err).toBeInstanceOf(IdParamError);
      expect((err as IdParamError).statusCode).toBe(422);
    });
  });

  describe("Opaque Timestamp codec", () => {
    it("works with the Opaque Timestamp codec's structural safeParse", async () => {
      const key = await importOpaqueKey(new Uint8Array(16));
      const inv = createOpaqueTimestampId("inv", { key, allowDuplicateBrand: true });
      const handler = idParam("id", inv);

      const validId = await inv.generate();
      const req = makeReq("id", validId);

      await handler(asReq(req), asReply());

      expect(req.params["id"]).toBe(validId);
    });

    it("wrong brand with Opaque Timestamp codec throws IdParamError with statusCode=404", async () => {
      const key = await importOpaqueKey(new Uint8Array(16));
      const inv = createOpaqueTimestampId("inv", { key, allowDuplicateBrand: true });
      const usrCodec = createTimestampId("usr", { allowDuplicateBrand: true });
      const handler = idParam("id", inv);

      const req = makeReq("id", usrCodec.generate());
      const err = await catchError(() => handler(asReq(req), asReply()));

      expect(err).toBeInstanceOf(IdParamError);
      expect((err as IdParamError).reason).toBe("brand_mismatch");
      expect((err as IdParamError).statusCode).toBe(404);
    });

    it("malformed payload with Opaque Timestamp codec throws IdParamError with statusCode=400", async () => {
      const key = await importOpaqueKey(new Uint8Array(16));
      const inv = createOpaqueTimestampId("inv", { key, allowDuplicateBrand: true });
      const handler = idParam("id", inv);

      const req = makeReq("id", "inv_uuuuuuuuuuuuuuuuuuuuuuuuuu");
      const err = await catchError(() => handler(asReq(req), asReply()));

      expect(err).toBeInstanceOf(IdParamError);
      expect((err as IdParamError).reason).toBe("malformed");
      expect((err as IdParamError).statusCode).toBe(400);
    });
  });

  describe("Reverse Timestamp codec", () => {
    it("works with the Reverse Timestamp codec's structural safeParse", async () => {
      const rev = createReverseTimestampId("rev", { allowDuplicateBrand: true });
      const handler = idParam("id", rev);

      const validId = rev.generate();
      const req = makeReq("id", validId);

      await handler(asReq(req), asReply());

      expect(req.params["id"]).toBe(validId);
    });

    it("wrong brand with Reverse Timestamp codec throws IdParamError with statusCode=404", async () => {
      const rev = createReverseTimestampId("rev", { allowDuplicateBrand: true });
      const usrCodec = createTimestampId("usr", { allowDuplicateBrand: true });
      const handler = idParam("id", rev);

      const req = makeReq("id", usrCodec.generate());
      const err = await catchError(() => handler(asReq(req), asReply()));

      expect(err).toBeInstanceOf(IdParamError);
      expect((err as IdParamError).reason).toBe("brand_mismatch");
      expect((err as IdParamError).statusCode).toBe(404);
    });

    it("malformed payload with Reverse Timestamp codec throws IdParamError with statusCode=400", async () => {
      const rev = createReverseTimestampId("rev", { allowDuplicateBrand: true });
      const handler = idParam("id", rev);

      const req = makeReq("id", "rev_uuuuuuuuuuuuuuuuuuuuuuuuuu");
      const err = await catchError(() => handler(asReq(req), asReply()));

      expect(err).toBeInstanceOf(IdParamError);
      expect((err as IdParamError).reason).toBe("malformed");
      expect((err as IdParamError).statusCode).toBe(400);
    });
  });

  describe("Wrapped key codec", () => {
    it("works with the Wrapped key codec's structural safeParse", async () => {
      const ord = await makeRealWrappedCodec("ord");
      const handler = idParam("id", ord);

      const validId = await ord.wrap(42);
      const req = makeReq("id", validId);

      await handler(asReq(req), asReply());

      expect(req.params["id"]).toBe(validId);
    });

    it("wrong brand with Wrapped key codec throws IdParamError with statusCode=404", async () => {
      const ord = await makeRealWrappedCodec("ord");
      const usrCodec = createTimestampId("usr", { allowDuplicateBrand: true });
      const handler = idParam("id", ord);

      const req = makeReq("id", usrCodec.generate());
      const err = await catchError(() => handler(asReq(req), asReply()));

      expect(err).toBeInstanceOf(IdParamError);
      expect((err as IdParamError).reason).toBe("brand_mismatch");
      expect((err as IdParamError).statusCode).toBe(404);
    });

    it("malformed payload with Wrapped key codec throws IdParamError with statusCode=400", async () => {
      const ord = await makeRealWrappedCodec("ord");
      const handler = idParam("id", ord);

      const req = makeReq("id", "ord_uuuuuuuuuuuuuuuuuuuuuuuuuu");
      const err = await catchError(() => handler(asReq(req), asReply()));

      expect(err).toBeInstanceOf(IdParamError);
      expect((err as IdParamError).reason).toBe("malformed");
      expect((err as IdParamError).statusCode).toBe(400);
    });
  });

  describe("safeParse-only contract (spy codec)", () => {
    it("preHandler calls only safeParse on the codec", async () => {
      const spyCodec = makeSpyCodec("spy");
      const handler = idParam("id", spyCodec);
      const req = makeReq("id", "any_value");
      await handler(asReq(req), asReply());
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

  it("valid canonical query param stores canonical Id on request.query and resolves", async () => {
    const handler = idQuery("userId", usr);
    const validId = usr.generate();
    const req = makeQueryReq("userId", validId);

    await handler(asQueryReq(req), asReply());

    expect(req.query["userId"]).toBe(validId);
  });

  it("valid non-canonical query param is normalized to canonical form in request.query", async () => {
    const handler = idQuery("userId", usr);
    const canonicalId = usr.generate();
    const nonCanonical = canonicalId.toUpperCase();
    const req = makeQueryReq("userId", nonCanonical);

    await handler(asQueryReq(req), asReply());

    expect(req.query["userId"]).toBe(canonicalId);
  });

  it("wrong brand (invalid_prefix) throws IdParamError with reason=brand_mismatch and statusCode=404", async () => {
    const handler = idQuery("userId", usr);
    const req = makeQueryReq("userId", org.generate());

    const err = await catchError(() => handler(asQueryReq(req), asReply()));

    expect(err).toBeInstanceOf(IdParamError);
    expect((err as IdParamError).reason).toBe("brand_mismatch");
    expect((err as IdParamError).statusCode).toBe(404);
  });

  it("malformed base32 payload (invalid_base32) throws IdParamError with reason=malformed and statusCode=400", async () => {
    const handler = idQuery("userId", usr);
    const req = makeQueryReq("userId", "usr_uuuuuuuuuuuuuuuuuuuuuuuuuu");

    const err = await catchError(() => handler(asQueryReq(req), asReply()));

    expect(err).toBeInstanceOf(IdParamError);
    expect((err as IdParamError).reason).toBe("malformed");
    expect((err as IdParamError).statusCode).toBe(400);
  });

  it("missing query param (undefined) throws IdParamError with reason=malformed and statusCode=400", async () => {
    const handler = idQuery("userId", usr);
    const req = makeQueryReq("userId", undefined);

    const err = await catchError(() => handler(asQueryReq(req), asReply()));

    expect(err).toBeInstanceOf(IdParamError);
    expect((err as IdParamError).reason).toBe("malformed");
    expect((err as IdParamError).statusCode).toBe(400);
  });

  it("onError log-only: hook is called with brand_mismatch failure, then IdParamError is thrown", async () => {
    const captured: IdParamFailure[] = [];
    const handler = idQuery("userId", usr, {
      onError: (failure) => {
        captured.push(failure);
      },
    });
    const req = makeQueryReq("userId", org.generate());

    const err = await catchError(() => handler(asQueryReq(req), asReply()));

    expect(captured).toHaveLength(1);
    expect(captured[0]?.reason).toBe("brand_mismatch");
    expect(captured[0]?.status).toBe(404);
    expect(err).toBeInstanceOf(IdParamError);
    expect((err as IdParamError).reason).toBe("brand_mismatch");
    expect((err as IdParamError).statusCode).toBe(404);
  });

  it("onError log-only: hook is called with malformed failure, then IdParamError is thrown", async () => {
    const captured: IdParamFailure[] = [];
    const handler = idQuery("userId", usr, {
      onError: (failure) => {
        captured.push(failure);
      },
    });
    const req = makeQueryReq("userId", "usr_uuuuuuuuuuuuuuuuuuuuuuuuuu");

    const err = await catchError(() => handler(asQueryReq(req), asReply()));

    expect(captured).toHaveLength(1);
    expect(captured[0]?.reason).toBe("malformed");
    expect(captured[0]?.status).toBe(400);
    expect(err).toBeInstanceOf(IdParamError);
    expect((err as IdParamError).reason).toBe("malformed");
    expect((err as IdParamError).statusCode).toBe(400);
  });

  it("onError responding hook: adapter does not throw when hook sends a reply", async () => {
    const handler = idQuery("userId", usr, {
      onError: (failure, _request, reply) => {
        reply.status(failure.status).send({ error: failure.reason });
      },
    });
    const req = makeQueryReq("userId", org.generate());

    const err = await catchError(() => handler(asQueryReq(req), asReply()));

    expect(err).toBeUndefined();
  });

  it("status remap: brand_mismatch remapped to 400 in thrown IdParamError", async () => {
    const handler = idQuery("userId", usr, { status: { brand_mismatch: 400 } });
    const req = makeQueryReq("userId", org.generate());

    const err = await catchError(() => handler(asQueryReq(req), asReply()));

    expect(err).toBeInstanceOf(IdParamError);
    expect((err as IdParamError).reason).toBe("brand_mismatch");
    expect((err as IdParamError).statusCode).toBe(400);
  });

  describe("safeParse-only contract (spy codec)", () => {
    it("preHandler calls only safeParse on the codec", async () => {
      const spyCodec = makeSpyCodec("spy");
      const handler = idQuery("id", spyCodec);
      const req = makeQueryReq("id", "any_value");
      await handler(asQueryReq(req), asReply());
      expect(spyCodec.safeParse).toHaveBeenCalled();
      expect(spyCodec.extractTimestamp).not.toHaveBeenCalled();
      expect(spyCodec.wrap).not.toHaveBeenCalled();
      expect(spyCodec.unwrap).not.toHaveBeenCalled();
    });
  });

  describe("failure-mapping (spy codec)", () => {
    it("safeParse failure from spy codec maps to malformed/400 and throws IdParamError", async () => {
      const failing = makeFailingSpyCodec("spy", "not_string");
      const handler = idQuery("id", failing);
      const req = makeQueryReq("id", "any_value");
      const err = await catchError(() => handler(asQueryReq(req), asReply()));
      expect(err).toBeInstanceOf(IdParamError);
      expect((err as IdParamError).reason).toBe("malformed");
      expect((err as IdParamError).statusCode).toBe(400);
    });

    it("invalid_prefix failure from spy codec maps to brand_mismatch/404 and throws IdParamError", async () => {
      const failing = makeFailingSpyCodec("spy", "invalid_prefix");
      const handler = idQuery("id", failing);
      const req = makeQueryReq("id", "any_value");
      const err = await catchError(() => handler(asQueryReq(req), asReply()));
      expect(err).toBeInstanceOf(IdParamError);
      expect((err as IdParamError).reason).toBe("brand_mismatch");
      expect((err as IdParamError).statusCode).toBe(404);
    });
  });
});

describe("idParam / idQuery — real fastify() app (integration)", () => {
  const usr = createTimestampId("usr", { allowDuplicateBrand: true });
  const org = createTimestampId("org", { allowDuplicateBrand: true });

  it("idParam happy path: inject GET returns 200 with canonical Id", async () => {
    const app = Fastify({ logger: false });
    app.get("/users/:id", { preHandler: idParam("id", usr) }, (request, reply) => {
      reply.send({ id: (request.params as Record<string, string>)["id"] });
    });
    await app.ready();
    const id = usr.generate();
    const res = await app.inject({ method: "GET", url: `/users/${id}` });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { id: string }).id).toBe(id);
    await app.close();
  });

  it("idParam error path: wrong brand returns 404 via setErrorHandler", async () => {
    const app = Fastify({ logger: false });
    app.get("/users/:id", { preHandler: idParam("id", usr) }, (_request, reply) => {
      reply.send({ ok: true });
    });
    app.setErrorHandler((err, _request, reply) => {
      const e: IdParamError = fromAny(err);
      reply.status(e.statusCode ?? 500).send({ error: e.reason });
    });
    await app.ready();
    const orgId = org.generate();
    const res = await app.inject({ method: "GET", url: `/users/${orgId}` });
    expect(res.statusCode).toBe(404);
    expect((res.json() as { error: string }).error).toBe("brand_mismatch");
    await app.close();
  });

  it("idParam error path: malformed ID returns 400 via setErrorHandler", async () => {
    const app = Fastify({ logger: false });
    app.get("/users/:id", { preHandler: idParam("id", usr) }, (_request, reply) => {
      reply.send({ ok: true });
    });
    app.setErrorHandler((err, _request, reply) => {
      const e: IdParamError = fromAny(err);
      reply.status(e.statusCode ?? 500).send({ error: e.reason });
    });
    await app.ready();
    const res = await app.inject({ method: "GET", url: "/users/usr_uuuuuuuuuuuuuuuuuuuuuuuuuu" });
    expect(res.statusCode).toBe(400);
    expect((res.json() as { error: string }).error).toBe("malformed");
    await app.close();
  });

  it("idQuery happy path: inject GET with query param returns 200 with canonical Id", async () => {
    const app = Fastify({ logger: false });
    app.get("/search", { preHandler: idQuery("userId", usr) }, (request, reply) => {
      reply.send({ id: (request.query as Record<string, string>)["userId"] });
    });
    await app.ready();
    const id = usr.generate();
    const res = await app.inject({ method: "GET", url: `/search?userId=${id}` });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { id: string }).id).toBe(id);
    await app.close();
  });

  it("idQuery error path: wrong brand returns 404", async () => {
    const app = Fastify({ logger: false });
    app.get("/search", { preHandler: idQuery("userId", usr) }, (_request, reply) => {
      reply.send({ ok: true });
    });
    app.setErrorHandler((err, _request, reply) => {
      const e: IdParamError = fromAny(err);
      reply.status(e.statusCode ?? 500).send({ error: e.reason });
    });
    await app.ready();
    const orgId = org.generate();
    const res = await app.inject({ method: "GET", url: `/search?userId=${orgId}` });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it("failure-mapping: safeParse failure from spy codec returns 400 via app.inject()", async () => {
    const failing = makeFailingSpyCodec("spy", "not_string");
    const app = Fastify({ logger: false });
    app.get("/test/:id", { preHandler: idParam("id", failing) }, (_request, reply) => {
      reply.send({ ok: true });
    });
    app.setErrorHandler((err, _request, reply) => {
      const e: IdParamError = fromAny(err);
      reply.status(e.statusCode ?? 500).send({ error: e.reason });
    });
    await app.ready();
    const res = await app.inject({ method: "GET", url: "/test/anything" });
    expect(res.statusCode).toBe(400);
    expect((res.json() as { error: string }).error).toBe("malformed");
    await app.close();
  });

  it("idParam onError log-only hook: adapter falls back to default 4xx; handler does not run", async () => {
    const app = Fastify({ logger: false });
    let handlerRan = false;
    app.get(
      "/protected/:id",
      {
        preHandler: idParam("id", usr, {
          onError: () => {
            // log-only — intentionally does not call reply.send
          },
        }),
      },
      (_request, reply) => {
        handlerRan = true;
        reply.send({ ok: true });
      },
    );
    app.setErrorHandler((err, _request, reply) => {
      const e: IdParamError = fromAny(err);
      reply.status(e.statusCode ?? 500).send({ error: e.reason });
    });
    await app.ready();
    const orgId = org.generate();
    const res = await app.inject({ method: "GET", url: `/protected/${orgId}` });
    expect(res.statusCode).toBe(404);
    expect((res.json() as { error: string }).error).toBe("brand_mismatch");
    expect(handlerRan).toBe(false);
    await app.close();
  });

  it("idQuery onError log-only hook: adapter falls back to default 4xx; handler does not run", async () => {
    const app = Fastify({ logger: false });
    let handlerRan = false;
    app.get(
      "/search2",
      {
        preHandler: idQuery("userId", usr, {
          onError: () => {
            // log-only — intentionally does not call reply.send
          },
        }),
      },
      (_request, reply) => {
        handlerRan = true;
        reply.send({ ok: true });
      },
    );
    app.setErrorHandler((err, _request, reply) => {
      const e: IdParamError = fromAny(err);
      reply.status(e.statusCode ?? 500).send({ error: e.reason });
    });
    await app.ready();
    const orgId = org.generate();
    const res = await app.inject({ method: "GET", url: `/search2?userId=${orgId}` });
    expect(res.statusCode).toBe(404);
    expect((res.json() as { error: string }).error).toBe("brand_mismatch");
    expect(handlerRan).toBe(false);
    await app.close();
  });

  it("idParam onError responding hook: hook response is used; handler does not run", async () => {
    const app = Fastify({ logger: false });
    let handlerRan = false;
    app.get(
      "/guarded/:id",
      {
        preHandler: idParam("id", usr, {
          onError: (failure, _request, reply) => {
            reply.status(failure.status).send({ custom: failure.reason });
          },
        }),
      },
      (_request, reply) => {
        handlerRan = true;
        reply.send({ ok: true });
      },
    );
    await app.ready();
    const orgId = org.generate();
    const res = await app.inject({ method: "GET", url: `/guarded/${orgId}` });
    expect(res.statusCode).toBe(404);
    expect((res.json() as { custom: string }).custom).toBe("brand_mismatch");
    expect(handlerRan).toBe(false);
    await app.close();
  });

  it("idQuery onError responding hook: hook response is used; handler does not run", async () => {
    const app = Fastify({ logger: false });
    let handlerRan = false;
    app.get(
      "/guarded2",
      {
        preHandler: idQuery("userId", usr, {
          onError: (failure, _request, reply) => {
            reply.status(failure.status).send({ custom: failure.reason });
          },
        }),
      },
      (_request, reply) => {
        handlerRan = true;
        reply.send({ ok: true });
      },
    );
    await app.ready();
    const orgId = org.generate();
    const res = await app.inject({ method: "GET", url: `/guarded2?userId=${orgId}` });
    expect(res.statusCode).toBe(404);
    expect((res.json() as { custom: string }).custom).toBe("brand_mismatch");
    expect(handlerRan).toBe(false);
    await app.close();
  });
});

describe("verify option", () => {
  let warnSilencer: ReturnType<typeof vi.spyOn>;
  beforeAll(() => {
    warnSilencer = vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterAll(() => {
    warnSilencer.mockRestore();
  });

  describe("idParam with verify: true (spy codec)", () => {
    it("forged-tag (safeVerify returns fail) → IdParamError with reason=malformed", async () => {
      const spyCodec = makeVerifiableSpyCodec("spy", "fail");
      let capturedError: unknown;
      const app = Fastify();
      app.setErrorHandler((err, _req, reply) => {
        capturedError = err;
        void reply.status(400).send({ error: (err as unknown as IdParamError).reason });
      });
      app.get(
        "/items/:id",
        { preHandler: idParam("id", spyCodec, { verify: true }) },
        (_req, reply) => {
          void reply.send({ ok: true });
        },
      );
      await app.ready();
      const res = await app.inject({ method: "GET", url: "/items/spy_00000000000000000000000000" });
      expect(res.statusCode).toBe(400);
      expect(capturedError).toBeInstanceOf(IdParamError);
      expect((capturedError as IdParamError).reason).toBe("malformed");
      await app.close();
    });

    it("valid tag (safeVerify returns ok) → handler runs", async () => {
      const spyCodec = makeVerifiableSpyCodec("spy", "ok");
      let handlerRan = false;
      const app = Fastify();
      app.get(
        "/items/:id",
        { preHandler: idParam("id", spyCodec, { verify: true }) },
        (_req, reply) => {
          handlerRan = true;
          void reply.send({ ok: true });
        },
      );
      await app.ready();
      const res = await app.inject({ method: "GET", url: "/items/spy_00000000000000000000000000" });
      expect(res.statusCode).toBe(200);
      expect(handlerRan).toBe(true);
      await app.close();
    });

    it("without verify, safeVerify is never called", async () => {
      const spyCodec = makeVerifiableSpyCodec("spy", "ok");
      const app = Fastify();
      app.get("/items/:id", { preHandler: idParam("id", spyCodec) }, (_req, reply) => {
        void reply.send({ ok: true });
      });
      await app.ready();
      await app.inject({ method: "GET", url: "/items/spy_00000000000000000000000000" });
      expect(spyCodec.safeVerify).not.toHaveBeenCalled();
      await app.close();
    });

    it("TypeScript rejects verify: true with non-verifiable codec; fail-closed at runtime (not 2xx)", async () => {
      const plain = makeSpyCodec("tst");
      // @ts-expect-error — plain codec lacks safeVerify; verify: true requires IdVerifiableCodec
      const preHandler = idParam("id", plain, { verify: true });
      const app = Fastify();
      app.get("/items/:id", { preHandler }, (_req, reply) => {
        void reply.send({ ok: true });
      });
      await app.ready();
      const res = await app.inject({ method: "GET", url: "/items/tst_00000000000000000000000000" });
      expect(res.statusCode).not.toBe(200);
      await app.close();
    });
  });

  describe("idParam with verify: true (real Signed Timestamp codec)", () => {
    it("structurally valid forged-tag ID is rejected with verify: true → 400", async () => {
      const signed = await makeRealSignedCodec("sgn");
      const validId = await signed.generate();
      const forged = validId.slice(0, 5) + (validId[5] === "0" ? "1" : "0") + validId.slice(6);

      const app = Fastify();
      app.setErrorHandler((err, _req, reply) => {
        void reply
          .status((err as unknown as IdParamError).statusCode ?? 500)
          .send({ error: (err as unknown as IdParamError).reason });
      });
      app.get(
        "/items/:id",
        { preHandler: idParam("id", signed, { verify: true }) },
        (_req, reply) => {
          void reply.send({ ok: true });
        },
      );
      await app.ready();
      const res = await app.inject({ method: "GET", url: `/items/${forged}` });
      expect(res.statusCode).toBe(400);
      await app.close();
    });

    it("HMAC-valid ID is accepted with verify: true", async () => {
      const signed = await makeRealSignedCodec("sgn");
      const validId = await signed.generate();

      const app = Fastify();
      app.get(
        "/items/:id",
        { preHandler: idParam("id", signed, { verify: true }) },
        (_req, reply) => {
          void reply.send({ ok: true });
        },
      );
      await app.ready();
      const res = await app.inject({ method: "GET", url: `/items/${validId}` });
      expect(res.statusCode).toBe(200);
      await app.close();
    });
  });

  describe("verify: true (real Wrapped key codec)", () => {
    it("idParam: structurally valid forged-tag ID is rejected → 400", async () => {
      const inv = await makeRealWrappedCodec("inv");
      const validId = await inv.wrap(7);
      // Tamper a non-final payload char (index 4, right after "inv_") so the id stays
      // structurally valid — the rejection must come from verification, not a parse failure.
      const forged = validId.slice(0, 4) + (validId[4] === "0" ? "1" : "0") + validId.slice(5);

      const app = Fastify();
      app.setErrorHandler((err, _req, reply) => {
        void reply
          .status((err as unknown as IdParamError).statusCode ?? 500)
          .send({ error: (err as unknown as IdParamError).reason });
      });
      app.get("/items/:id", { preHandler: idParam("id", inv, { verify: true }) }, (_req, reply) => {
        void reply.send({ ok: true });
      });
      await app.ready();
      const res = await app.inject({ method: "GET", url: `/items/${forged}` });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual({ error: "malformed" });
      await app.close();
    });

    it("idParam: structurally malformed input is rejected via the parse channel → 400", async () => {
      const inv = await makeRealWrappedCodec("inv");
      const app = Fastify();
      app.setErrorHandler((err, _req, reply) => {
        void reply
          .status((err as unknown as IdParamError).statusCode ?? 500)
          .send({ error: (err as unknown as IdParamError).reason });
      });
      // "u" is not in the Crockford base32 alphabet → invalid_base32 → malformed, before verify
      app.get("/items/:id", { preHandler: idParam("id", inv, { verify: true }) }, (_req, reply) => {
        void reply.send({ ok: true });
      });
      await app.ready();
      const res = await app.inject({ method: "GET", url: "/items/inv_uuuuuuuuuuuuuuuuuuuuuuuuuu" });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual({ error: "malformed" });
      await app.close();
    });

    it("idParam: tag-valid ID is accepted with verify: true", async () => {
      const inv = await makeRealWrappedCodec("inv");
      const validId = await inv.wrap(7);

      const app = Fastify();
      app.get("/items/:id", { preHandler: idParam("id", inv, { verify: true }) }, (_req, reply) => {
        void reply.send({ ok: true });
      });
      await app.ready();
      const res = await app.inject({ method: "GET", url: `/items/${validId}` });
      expect(res.statusCode).toBe(200);
      await app.close();
    });

    it("idQuery: tag-valid ID is accepted with verify: true", async () => {
      const inv = await makeRealWrappedCodec("inv");
      const validId = await inv.wrap(7);

      const app = Fastify();
      app.get("/items", { preHandler: idQuery("id", inv, { verify: true }) }, (_req, reply) => {
        void reply.send({ ok: true });
      });
      await app.ready();
      const res = await app.inject({ method: "GET", url: `/items?id=${validId}` });
      expect(res.statusCode).toBe(200);
      await app.close();
    });

    it("idParam: verify: true calls safeVerify on the Wrapped codec (spy)", async () => {
      const spyCodec = makeWrappedVerifiableSpyCodec("inv", "ok");
      const app = Fastify();
      app.get(
        "/items/:id",
        { preHandler: idParam("id", spyCodec, { verify: true }) },
        (_req, reply) => {
          void reply.send({ ok: true });
        },
      );
      await app.ready();
      await app.inject({ method: "GET", url: "/items/inv_00000000000000000000000000" });
      expect(spyCodec.safeVerify).toHaveBeenCalled();
      await app.close();
    });
  });

  describe("idQuery with verify: true (spy codec)", () => {
    it("forged-tag (safeVerify returns fail) → IdParamError with reason=malformed", async () => {
      const spyCodec = makeVerifiableSpyCodec("spy", "fail");
      let capturedError: unknown;
      const app = Fastify();
      app.setErrorHandler((err, _req, reply) => {
        capturedError = err;
        void reply.status(400).send({ error: (err as unknown as IdParamError).reason });
      });
      app.get(
        "/items",
        { preHandler: idQuery("id", spyCodec, { verify: true }) },
        (_req, reply) => {
          void reply.send({ ok: true });
        },
      );
      await app.ready();
      const res = await app.inject({
        method: "GET",
        url: "/items?id=spy_00000000000000000000000000",
      });
      expect(res.statusCode).toBe(400);
      expect(capturedError).toBeInstanceOf(IdParamError);
      expect((capturedError as IdParamError).reason).toBe("malformed");
      await app.close();
    });

    it("valid tag (safeVerify returns ok) → handler runs", async () => {
      const spyCodec = makeVerifiableSpyCodec("spy", "ok");
      let handlerRan = false;
      const app = Fastify();
      app.get(
        "/items",
        { preHandler: idQuery("id", spyCodec, { verify: true }) },
        (_req, reply) => {
          handlerRan = true;
          void reply.send({ ok: true });
        },
      );
      await app.ready();
      const res = await app.inject({
        method: "GET",
        url: "/items?id=spy_00000000000000000000000000",
      });
      expect(res.statusCode).toBe(200);
      expect(handlerRan).toBe(true);
      await app.close();
    });

    it("idParam verify: true with onError that sends reply — adapter does not throw", async () => {
      const spyCodec = makeVerifiableSpyCodec("spy", "fail");
      let handlerRan = false;
      const app = Fastify();
      app.get(
        "/items/:id",
        {
          preHandler: idParam("id", spyCodec, {
            verify: true,
            onError: (failure, _req, reply) => {
              void reply.status(failure.status).send({ error: failure.reason });
            },
          }),
        },
        (_req, reply) => {
          handlerRan = true;
          void reply.send({ ok: true });
        },
      );
      await app.ready();
      const res = await app.inject({ method: "GET", url: "/items/spy_00000000000000000000000000" });
      expect(res.statusCode).toBe(400);
      expect(handlerRan).toBe(false);
      await app.close();
    });

    it("idQuery verify: true with onError that sends reply — adapter does not throw", async () => {
      const spyCodec = makeVerifiableSpyCodec("spy", "fail");
      let handlerRan = false;
      const app = Fastify();
      app.get(
        "/items",
        {
          preHandler: idQuery("id", spyCodec, {
            verify: true,
            onError: (failure, _req, reply) => {
              void reply.status(failure.status).send({ error: failure.reason });
            },
          }),
        },
        (_req, reply) => {
          handlerRan = true;
          void reply.send({ ok: true });
        },
      );
      await app.ready();
      const res = await app.inject({
        method: "GET",
        url: "/items?id=spy_00000000000000000000000000",
      });
      expect(res.statusCode).toBe(400);
      expect(handlerRan).toBe(false);
      await app.close();
    });

    it("idParam verify: true with onError that does NOT send reply — IdParamError is still thrown", async () => {
      const spyCodec = makeVerifiableSpyCodec("spy", "fail");
      let capturedError: unknown;
      const app = Fastify();
      app.setErrorHandler((err, _req, reply) => {
        capturedError = err;
        void reply.status(400).send({ error: (err as unknown as IdParamError).reason });
      });
      app.get(
        "/items/:id",
        {
          preHandler: idParam("id", spyCodec, {
            verify: true,
            onError: () => {
              /* log-only: no reply sent */
            },
          }),
        },
        (_req, reply) => {
          void reply.send({ ok: true });
        },
      );
      await app.ready();
      const res = await app.inject({ method: "GET", url: "/items/spy_00000000000000000000000000" });
      expect(res.statusCode).toBe(400);
      expect(capturedError).toBeInstanceOf(IdParamError);
      expect((capturedError as IdParamError).reason).toBe("malformed");
      await app.close();
    });

    it("idQuery verify: true with onError that does NOT send reply — IdParamError is still thrown", async () => {
      const spyCodec = makeVerifiableSpyCodec("spy", "fail");
      let capturedError: unknown;
      const app = Fastify();
      app.setErrorHandler((err, _req, reply) => {
        capturedError = err;
        void reply.status(400).send({ error: (err as unknown as IdParamError).reason });
      });
      app.get(
        "/items",
        {
          preHandler: idQuery("id", spyCodec, {
            verify: true,
            onError: () => {
              /* log-only: no reply sent */
            },
          }),
        },
        (_req, reply) => {
          void reply.send({ ok: true });
        },
      );
      await app.ready();
      const res = await app.inject({
        method: "GET",
        url: "/items?id=spy_00000000000000000000000000",
      });
      expect(res.statusCode).toBe(400);
      expect(capturedError).toBeInstanceOf(IdParamError);
      expect((capturedError as IdParamError).reason).toBe("malformed");
      await app.close();
    });
  });
});
