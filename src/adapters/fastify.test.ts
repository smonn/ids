import { fromAny } from "@total-typescript/shoehorn";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { FastifyReply, FastifyRequest } from "fastify";
import { IdParamError, idParam } from "./fastify.js";
import type { IdParamFailure } from "./fastify.js";
import { createOpaqueTimestampId, importOpaqueKey } from "../codecs/opaque/index.js";
import { createReverseTimestampId } from "../codecs/reverse/index.js";
import { createTimestampId } from "../codecs/timestamp/index.js";
import { createWrappedKeyId, importWrappingKey } from "../codecs/wrapped/index.js";

type MockRequest = {
  params: Record<string, unknown>;
};

function makeReq(paramName: string, value: string | undefined): MockRequest {
  return { params: { [paramName]: value } };
}

function asReq<T extends FastifyRequest = FastifyRequest>(req: MockRequest): T {
  return fromAny(req);
}

function asReply(): FastifyReply {
  return fromAny({});
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

    it("onError override: consumer fully owns the response for brand mismatch", async () => {
      const captured: IdParamFailure[] = [];
      const handler = idParam("id", usr, {
        onError: (failure) => {
          captured.push(failure);
        },
      });
      const req = makeReq("id", org.generate());

      await handler(asReq(req), asReply());

      expect(captured).toHaveLength(1);
      expect(captured[0]?.reason).toBe("brand_mismatch");
      expect(captured[0]?.status).toBe(404);
    });

    it("onError override: consumer fully owns the response for malformed ID", async () => {
      const captured: IdParamFailure[] = [];
      const handler = idParam("id", usr, {
        onError: (failure) => {
          captured.push(failure);
        },
      });
      const req = makeReq("id", "usr_uuuuuuuuuuuuuuuuuuuuuuuuuu");

      await handler(asReq(req), asReply());

      expect(captured).toHaveLength(1);
      expect(captured[0]?.reason).toBe("malformed");
      expect(captured[0]?.status).toBe(400);
    });

    it("onError override: adapter does not throw when onError is provided", async () => {
      const onError = vi.fn();
      const handler = idParam("id", usr, { onError });
      const req = makeReq("id", org.generate());

      const err = await catchError(() => handler(asReq(req), asReply()));

      expect(err).toBeUndefined();
      expect(onError).toHaveBeenCalledOnce();
    });

    it("status remap: brand_mismatch remapped to 400 in thrown IdParamError", async () => {
      const handler = idParam("id", usr, { status: { brand_mismatch: 400 } });
      const req = makeReq("id", org.generate());

      const err = await catchError(() => handler(asReq(req), asReply()));

      expect(err).toBeInstanceOf(IdParamError);
      expect((err as IdParamError).reason).toBe("brand_mismatch");
      expect((err as IdParamError).statusCode).toBe(400);
    });

    it("status remap: remapped status is passed to onError failure object", async () => {
      const captured: IdParamFailure[] = [];
      const handler = idParam("id", usr, {
        status: { malformed: 422 },
        onError: (failure) => {
          captured.push(failure);
        },
      });
      const req = makeReq("id", "usr_uuuuuuuuuuuuuuuuuuuuuuuuuu");

      await handler(asReq(req), asReply());

      expect(captured[0]?.status).toBe(422);
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
      const key = await importWrappingKey(new Uint8Array(32));
      const ord = createWrappedKeyId("ord", {
        kind: "u32",
        keys: [key],
        allowDuplicateBrand: true,
      });
      const handler = idParam("id", ord);

      const validId = await ord.wrap(42);
      const req = makeReq("id", validId);

      await handler(asReq(req), asReply());

      expect(req.params["id"]).toBe(validId);
    });

    it("wrong brand with Wrapped key codec throws IdParamError with statusCode=404", async () => {
      const key = await importWrappingKey(new Uint8Array(32));
      const ord = createWrappedKeyId("ord", {
        kind: "u32",
        keys: [key],
        allowDuplicateBrand: true,
      });
      const usrCodec = createTimestampId("usr", { allowDuplicateBrand: true });
      const handler = idParam("id", ord);

      const req = makeReq("id", usrCodec.generate());
      const err = await catchError(() => handler(asReq(req), asReply()));

      expect(err).toBeInstanceOf(IdParamError);
      expect((err as IdParamError).reason).toBe("brand_mismatch");
      expect((err as IdParamError).statusCode).toBe(404);
    });

    it("malformed payload with Wrapped key codec throws IdParamError with statusCode=400", async () => {
      const key = await importWrappingKey(new Uint8Array(32));
      const ord = createWrappedKeyId("ord", {
        kind: "u32",
        keys: [key],
        allowDuplicateBrand: true,
      });
      const handler = idParam("id", ord);

      const req = makeReq("id", "ord_uuuuuuuuuuuuuuuuuuuuuuuuuu");
      const err = await catchError(() => handler(asReq(req), asReply()));

      expect(err).toBeInstanceOf(IdParamError);
      expect((err as IdParamError).reason).toBe("malformed");
      expect((err as IdParamError).statusCode).toBe(400);
    });
  });
});
