---
title: Express adapter
description: Validate route params against an @smonn/ids codec in Express.
---

`@smonn/ids/express` provides the `idParam` factory for Express. Express is an
**optional peer dependency**.

```bash
pnpm add express
```

```ts
import { idParam, IdParamError } from "@smonn/ids/express";
import { createTimestampId } from "@smonn/ids";

const usr = createTimestampId("usr");
const org = createTimestampId("org");
const handler = (req, res) => res.json({ ok: true });

// Default: calls next(err) with an IdParamError → error-handling middleware renders it
app.get("/users/:id", idParam("id", usr), (req, res) => {
  const id = res.locals.id; // Id<"usr">, canonical
});

// Error-handling middleware receives the typed error
app.use((err, req, res, next) => {
  if (err instanceof IdParamError) {
    res.status(err.status).json({ error: err.reason });
    return;
  }
  next(err);
});

// Override: consumer fully owns the error response
app.get(
  "/orgs/:id",
  idParam("id", org, {
    onError: (failure, req, res) => res.status(failure.status).json({ error: failure.reason }),
  }),
  handler,
);
```

- **Default error channel:** on failure the adapter calls `next(err)` with an
  `IdParamError` carrying `status` and `reason` — it does **not** write a body
  itself.
- **`options.onError`:** when provided, the hook owns the response; the adapter
  does not call `next(err)`.
- **`options.status`:** remaps the default HTTP status for a failure reason.

The 400 vs 404 defaults match the [Hono adapter](/adapters/hono/):
`reason: "brand_mismatch"` → 404, `reason: "malformed"` → 400. The canonical
`Id<Brand>` is stored in `res.locals` under the param name.
