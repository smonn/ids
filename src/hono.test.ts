import { Hono } from "hono";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { idParam } from "./hono.js";
import { createOpaqueTimestampId, importOpaqueKey } from "./codecs/opaque/index.js";
import { createTimestampId } from "./codecs/timestamp/index.js";

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
});
