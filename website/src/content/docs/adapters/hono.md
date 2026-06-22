---
title: Hono adapter
description: Validate route params against an @smonn/ids codec in Hono.
---

`@smonn/ids/hono` provides `idParam` — a middleware factory that validates a
named route param against a codec and exposes the canonical `Id<Brand>` to the
handler. Hono is an **optional peer dependency**.

```bash
pnpm add hono
```

```ts
import { idParam } from "@smonn/ids/hono";
import { createTimestampId } from "@smonn/ids";

const usr = createTimestampId("usr");

// Default: throws HTTPException → app.onError handles rendering
app.get("/users/:id", idParam("id", usr), (c) => {
  const id = c.get("id"); // Id<"usr">, canonical
});

// Override: consumer fully owns the error response
app.get(
  "/orgs/:id",
  idParam("id", org, {
    onError: (failure, c) => c.json({ error: failure.reason }, failure.status),
  }),
  handler,
);

// Or a lightweight status remap
app.get("/things/:id", idParam("id", thing, { status: { brand_mismatch: 400 } }), handler);
```

- **Default error channel:** on failure the adapter throws `HTTPException(status)`
  — it does **not** write a body itself, so your existing `app.onError`
  controls content negotiation.
- **`options.onError`:** when provided, the hook owns the response entirely.
- **`options.status`:** remaps the default HTTP status for a failure reason.

## 400 vs 404 defaults

- **Brand mismatch** (`invalid_prefix`) → `reason: "brand_mismatch"`, status
  **404**. A `usr_` ID makes no sense on `/orders/:id` — the resource cannot
  exist under this route.
- **Malformed or missing ID** (`invalid_base32` / `not_string`) →
  `reason: "malformed"`, status **400**.

`idParam` calls `safeParse` at the boundary (lenient: mixed case and Crockford
aliases), so the handler always receives a canonical, normalized `Id<Brand>`.
Works with any codec variant's structural `safeParse`.
