import { Hono } from "hono";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { idParam, idQuery, IdParamError } from "./hono.js";
import { createOpaqueTimestampId, importOpaqueKey } from "../codecs/opaque/index.js";
import { createSignedTimestampId, importSigningKey } from "../codecs/signed/index.js";
import { createTimestampId } from "../codecs/timestamp/index.js";
import { makeSpyCodec, makeVerifiableSpyCodec } from "./test-helpers.js";

describe("IdParamError", () => {
  it("err.name is 'IdParamError'", () => {
    const err = new IdParamError("brand_mismatch", 404);
    expect(err.name).toBe("IdParamError");
  });
});

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

    function makeApp() {
      const app = new Hono();
      app.get("/users/:id", idParam("id", usr), (c) => {
        return c.json({ id: c.get("id") });
      });
      return app;
    }

    it("valid canonical param calls next and exposes canonical Id on context", async () => {
      const app = makeApp();
      const validId = usr.generate();
      const res = await app.request(`/users/${validId}`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { id: string };
      expect(body.id).toBe(validId);
    });

    it("valid non-canonical param is normalized to canonical form before reaching handler", async () => {
      const app = makeApp();
      const canonicalId = usr.generate();
      const nonCanonical = canonicalId.toUpperCase();
      const res = await app.request(`/users/${nonCanonical}`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { id: string };
      expect(body.id).toBe(canonicalId);
    });

    it("wrong brand (invalid_prefix) throws HTTPException → 404 via app.onError", async () => {
      const app = makeApp();
      const orgId = org.generate();
      const res = await app.request(`/users/${orgId}`);
      expect(res.status).toBe(404);
    });

    it("malformed base32 payload (invalid_base32) throws HTTPException → 400 via app.onError", async () => {
      const app = makeApp();
      // "usr_" prefix is correct, but payload contains "u" which is not in the
      // Crockford base32 alphabet
      const res = await app.request("/users/usr_uuuuuuuuuuuuuuuuuuuuuuuuuu");
      expect(res.status).toBe(400);
    });

    it("onError override: consumer fully owns the response for brand mismatch", async () => {
      const app = new Hono();
      app.get(
        "/users/:id",
        idParam("id", usr, {
          onError: (failure, c) => c.json({ error: failure.reason }, failure.status as 404),
        }),
        (c) => c.json({ id: c.get("id") }),
      );
      const orgId = org.generate();
      const res = await app.request(`/users/${orgId}`);
      expect(res.status).toBe(404);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe("brand_mismatch");
    });

    it("onError override: consumer fully owns the response for malformed ID", async () => {
      const app = new Hono();
      app.get(
        "/users/:id",
        idParam("id", usr, {
          onError: (failure, c) => c.json({ error: failure.reason }, failure.status as 400),
        }),
        (c) => c.json({ id: c.get("id") }),
      );
      const res = await app.request("/users/usr_uuuuuuuuuuuuuuuuuuuuuuuuuu");
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe("malformed");
    });

    it("status remap: brand_mismatch remapped to 400", async () => {
      const app = new Hono();
      app.get("/users/:id", idParam("id", usr, { status: { brand_mismatch: 400 } }), (c) =>
        c.json({ id: c.get("id") }),
      );
      const orgId = org.generate();
      const res = await app.request(`/users/${orgId}`);
      expect(res.status).toBe(400);
    });

    it("TypeScript rejects non-ContentfulStatusCode values for options.status", () => {
      const app = new Hono();
      // @ts-expect-error — 999 is not a valid ContentfulStatusCode
      app.get("/users/:id", idParam("id", usr, { status: { brand_mismatch: 999 } }), (c) =>
        c.json({ id: c.get("id") }),
      );
      expect(app).toBeDefined();
    });

    describe("app.onError receives IdParamError with reason", () => {
      it("brand_mismatch: app.onError receives IdParamError with reason === 'brand_mismatch'", async () => {
        let capturedError: unknown;
        const app = new Hono();
        app.get("/users/:id", idParam("id", usr), (c) => c.json({ id: c.get("id") }));
        app.onError((err, c) => {
          capturedError = err;
          return c.json({ error: "handled" }, 500);
        });
        const orgId = org.generate();
        await app.request(`/users/${orgId}`);
        expect(capturedError).toBeInstanceOf(IdParamError);
        expect((capturedError as IdParamError).reason).toBe("brand_mismatch");
      });

      it("malformed: app.onError receives IdParamError with reason === 'malformed'", async () => {
        let capturedError: unknown;
        const app = new Hono();
        app.get("/users/:id", idParam("id", usr), (c) => c.json({ id: c.get("id") }));
        app.onError((err, c) => {
          capturedError = err;
          return c.json({ error: "handled" }, 500);
        });
        await app.request("/users/usr_uuuuuuuuuuuuuuuuuuuuuuuuuu");
        expect(capturedError).toBeInstanceOf(IdParamError);
        expect((capturedError as IdParamError).reason).toBe("malformed");
      });

      it("status remap: reason still discriminates even when both reasons map to same status", async () => {
        const capturedReasons: string[] = [];
        const app = new Hono();
        app.get(
          "/users/:id",
          idParam("id", usr, { status: { brand_mismatch: 400, malformed: 400 } }),
          (c) => c.json({ id: c.get("id") }),
        );
        app.onError((err, c) => {
          if (err instanceof IdParamError) capturedReasons.push(err.reason);
          return c.json({ error: "handled" }, 400);
        });
        const orgId = org.generate();
        await app.request(`/users/${orgId}`);
        await app.request("/users/usr_uuuuuuuuuuuuuuuuuuuuuuuuuu");
        expect(capturedReasons).toEqual(["brand_mismatch", "malformed"]);
      });
    });
  });

  describe("Opaque Timestamp codec", () => {
    it("works with the Opaque Timestamp codec's structural safeParse", async () => {
      const key = await importOpaqueKey(new Uint8Array(16));
      const inv = createOpaqueTimestampId("inv", { key, allowDuplicateBrand: true });
      const app = new Hono();
      app.get("/invoices/:id", idParam("id", inv), (c) => {
        return c.json({ id: c.get("id") });
      });

      const validId = await inv.generate();
      const res = await app.request(`/invoices/${validId}`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { id: string };
      expect(body.id).toBe(validId);
    });

    it("wrong brand with Opaque Timestamp codec throws HTTPException → 404", async () => {
      const key = await importOpaqueKey(new Uint8Array(16));
      const inv = createOpaqueTimestampId("inv", { key, allowDuplicateBrand: true });
      const usr = createTimestampId("usr", { allowDuplicateBrand: true });
      const app = new Hono();
      app.get("/invoices/:id", idParam("id", inv), (c) => {
        return c.json({ id: c.get("id") });
      });

      const usrId = usr.generate();
      const res = await app.request(`/invoices/${usrId}`);
      expect(res.status).toBe(404);
    });

    it("malformed payload with Opaque Timestamp codec throws HTTPException → 400", async () => {
      const key = await importOpaqueKey(new Uint8Array(16));
      const inv = createOpaqueTimestampId("inv", { key, allowDuplicateBrand: true });
      const app = new Hono();
      app.get("/invoices/:id", idParam("id", inv), (c) => {
        return c.json({ id: c.get("id") });
      });

      const res = await app.request("/invoices/inv_uuuuuuuuuuuuuuuuuuuuuuuuuu");
      expect(res.status).toBe(400);
    });
  });

  describe("safeParse-only contract (spy codec)", () => {
    it("middleware calls only safeParse on the codec", async () => {
      const spyCodec = makeSpyCodec("spy");
      const app = new Hono();
      app.get("/items/:id", idParam("id", spyCodec), (c) => c.text("ok"));
      await app.request("/items/any_value");
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

  function makeApp() {
    const app = new Hono();
    app.get("/users", idQuery("userId", usr), (c) => {
      return c.json({ id: c.get("userId") });
    });
    return app;
  }

  it("valid canonical query param calls next and exposes canonical Id on context", async () => {
    const app = makeApp();
    const validId = usr.generate();
    const res = await app.request(`/users?userId=${validId}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string };
    expect(body.id).toBe(validId);
  });

  it("valid non-canonical query param is normalized to canonical form before reaching handler", async () => {
    const app = makeApp();
    const canonicalId = usr.generate();
    const nonCanonical = canonicalId.toUpperCase();
    const res = await app.request(`/users?userId=${nonCanonical}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string };
    expect(body.id).toBe(canonicalId);
  });

  it("wrong brand (invalid_prefix) throws HTTPException → 404 via app.onError", async () => {
    const app = makeApp();
    const orgId = org.generate();
    const res = await app.request(`/users?userId=${orgId}`);
    expect(res.status).toBe(404);
  });

  it("malformed base32 payload (invalid_base32) throws HTTPException → 400 via app.onError", async () => {
    const app = makeApp();
    const res = await app.request("/users?userId=usr_uuuuuuuuuuuuuuuuuuuuuuuuuu");
    expect(res.status).toBe(400);
  });

  it("missing query param (undefined) throws HTTPException → 400 via app.onError", async () => {
    const app = makeApp();
    const res = await app.request("/users");
    expect(res.status).toBe(400);
  });

  it("onError override: consumer fully owns the response for brand mismatch", async () => {
    const app = new Hono();
    app.get(
      "/users",
      idQuery("userId", usr, {
        onError: (failure, c) => c.json({ error: failure.reason }, failure.status as 404),
      }),
      (c) => c.json({ id: c.get("userId") }),
    );
    const orgId = org.generate();
    const res = await app.request(`/users?userId=${orgId}`);
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("brand_mismatch");
  });

  it("onError override: consumer fully owns the response for malformed ID", async () => {
    const app = new Hono();
    app.get(
      "/users",
      idQuery("userId", usr, {
        onError: (failure, c) => c.json({ error: failure.reason }, failure.status as 400),
      }),
      (c) => c.json({ id: c.get("userId") }),
    );
    const res = await app.request("/users?userId=usr_uuuuuuuuuuuuuuuuuuuuuuuuuu");
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("malformed");
  });

  it("status remap: brand_mismatch remapped to 400", async () => {
    const app = new Hono();
    app.get("/users", idQuery("userId", usr, { status: { brand_mismatch: 400 } }), (c) =>
      c.json({ id: c.get("userId") }),
    );
    const orgId = org.generate();
    const res = await app.request(`/users?userId=${orgId}`);
    expect(res.status).toBe(400);
  });

  describe("app.onError receives IdParamError with reason", () => {
    it("brand_mismatch: app.onError receives IdParamError with reason === 'brand_mismatch'", async () => {
      let capturedError: unknown;
      const app = new Hono();
      app.get("/users", idQuery("userId", usr), (c) => c.json({ id: c.get("userId") }));
      app.onError((err, c) => {
        capturedError = err;
        return c.json({ error: "handled" }, 500);
      });
      const orgId = org.generate();
      await app.request(`/users?userId=${orgId}`);
      expect(capturedError).toBeInstanceOf(IdParamError);
      expect((capturedError as IdParamError).reason).toBe("brand_mismatch");
    });

    it("malformed: app.onError receives IdParamError with reason === 'malformed'", async () => {
      let capturedError: unknown;
      const app = new Hono();
      app.get("/users", idQuery("userId", usr), (c) => c.json({ id: c.get("userId") }));
      app.onError((err, c) => {
        capturedError = err;
        return c.json({ error: "handled" }, 500);
      });
      await app.request("/users?userId=usr_uuuuuuuuuuuuuuuuuuuuuuuuuu");
      expect(capturedError).toBeInstanceOf(IdParamError);
      expect((capturedError as IdParamError).reason).toBe("malformed");
    });

    it("status remap: reason still discriminates even when both reasons map to same status", async () => {
      const capturedReasons: string[] = [];
      const app = new Hono();
      app.get(
        "/users",
        idQuery("userId", usr, { status: { brand_mismatch: 400, malformed: 400 } }),
        (c) => c.json({ id: c.get("userId") }),
      );
      app.onError((err, c) => {
        if (err instanceof IdParamError) capturedReasons.push(err.reason);
        return c.json({ error: "handled" }, 400);
      });
      const orgId = org.generate();
      await app.request(`/users?userId=${orgId}`);
      await app.request("/users?userId=usr_uuuuuuuuuuuuuuuuuuuuuuuuuu");
      expect(capturedReasons).toEqual(["brand_mismatch", "malformed"]);
    });
  });

  describe("safeParse-only contract (spy codec)", () => {
    it("middleware calls only safeParse on the codec", async () => {
      const spyCodec = makeSpyCodec("spy");
      const app = new Hono();
      app.get("/items", idQuery("id", spyCodec), (c) => c.text("ok"));
      await app.request("/items?id=any_value");
      expect(spyCodec.safeParse).toHaveBeenCalled();
      expect(spyCodec.extractTimestamp).not.toHaveBeenCalled();
      expect(spyCodec.wrap).not.toHaveBeenCalled();
      expect(spyCodec.unwrap).not.toHaveBeenCalled();
    });
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

  describe("idParam with verify: true", () => {
    it("forged-tag ID (structurally valid, safeVerify fails) → 400 via app.onError", async () => {
      const key = await importSigningKey(new Uint8Array(32));
      const signed = createSignedTimestampId("sgn", { keys: [key], allowDuplicateBrand: true });
      const forgedId = await signed.generate();
      // Tamper the ID by flipping a character in the payload (keep prefix valid, break tag)
      const forged = forgedId.slice(0, 5) + (forgedId[5] === "0" ? "1" : "0") + forgedId.slice(6);

      const app = new Hono();
      app.get("/items/:id", idParam("id", signed, { verify: true }), (c) =>
        c.json({ id: c.get("id") }),
      );
      const res = await app.request(`/items/${forged}`);
      expect(res.status).toBe(400);
    });

    it("structurally valid, HMAC-valid ID is accepted with verify: true", async () => {
      const key = await importSigningKey(new Uint8Array(32));
      const signed = createSignedTimestampId("sgn", { keys: [key], allowDuplicateBrand: true });
      const validId = await signed.generate();

      const app = new Hono();
      app.get("/items/:id", idParam("id", signed, { verify: true }), (c) =>
        c.json({ id: c.get("id") }),
      );
      const res = await app.request(`/items/${validId}`);
      expect(res.status).toBe(200);
    });

    it("without verify option, structurally valid forged-tag ID is accepted", async () => {
      const key = await importSigningKey(new Uint8Array(32));
      const signed = createSignedTimestampId("sgn", { keys: [key], allowDuplicateBrand: true });
      const validId = await signed.generate();
      const forged = validId.slice(0, 5) + (validId[5] === "0" ? "1" : "0") + validId.slice(6);
      // Only structurally valid check; forged tag accepted without verify
      const app = new Hono();
      app.get("/items/:id", idParam("id", signed), (c) => c.json({ id: c.get("id") }));
      const res = await app.request(`/items/${forged}`);
      expect(res.status).toBe(200);
    });

    it("verify: true with onError override routes forged tag through onError", async () => {
      const spyCodec = makeVerifiableSpyCodec("spy", "fail");
      const app = new Hono();
      app.get(
        "/items/:id",
        idParam("id", spyCodec, {
          verify: true,
          onError: (failure, c) => c.json({ error: failure.reason }, failure.status as 400),
        }),
        (c) => c.text("ok"),
      );
      const res = await app.request("/items/spy_00000000000000000000000000");
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe("malformed");
    });

    it("verify: true calls safeVerify on the codec (spy)", async () => {
      const spyCodec = makeVerifiableSpyCodec("spy", "ok");
      const app = new Hono();
      app.get("/items/:id", idParam("id", spyCodec, { verify: true }), (c) => c.text("ok"));
      await app.request("/items/spy_00000000000000000000000000");
      expect(spyCodec.safeVerify).toHaveBeenCalled();
    });

    it("without verify, safeVerify is never called (spy)", async () => {
      const spyCodec = makeVerifiableSpyCodec("spy", "ok");
      const app = new Hono();
      app.get("/items/:id", idParam("id", spyCodec), (c) => c.text("ok"));
      await app.request("/items/spy_00000000000000000000000000");
      expect(spyCodec.safeVerify).not.toHaveBeenCalled();
    });
  });

  describe("idQuery with verify: true", () => {
    it("forged-tag ID (spy codec) is rejected with verify: true → 400", async () => {
      const spyCodec = makeVerifiableSpyCodec("spy", "fail");
      const app = new Hono();
      app.get("/items", idQuery("id", spyCodec, { verify: true }), (c) => c.text("ok"));
      const res = await app.request("/items?id=spy_00000000000000000000000000");
      expect(res.status).toBe(400);
    });

    it("valid ID (spy codec) accepted with verify: true", async () => {
      const spyCodec = makeVerifiableSpyCodec("spy", "ok");
      const app = new Hono();
      app.get("/items", idQuery("id", spyCodec, { verify: true }), (c) => c.text("ok"));
      const res = await app.request("/items?id=spy_00000000000000000000000000");
      expect(res.status).toBe(200);
    });

    it("verify: true with onError override routes forged query tag through onError", async () => {
      const spyCodec = makeVerifiableSpyCodec("spy", "fail");
      const app = new Hono();
      app.get(
        "/items",
        idQuery("id", spyCodec, {
          verify: true,
          onError: (failure, c) => c.json({ error: failure.reason }, failure.status as 400),
        }),
        (c) => c.text("ok"),
      );
      const res = await app.request("/items?id=spy_00000000000000000000000000");
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe("malformed");
    });
  });
});
