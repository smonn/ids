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

## `IdParamFailure` shape

The `onError` callback receives an `IdParamFailure` — a discriminated union on `reason`:

```ts
type IdParamFailure =
  | { readonly reason: "brand_mismatch"; readonly status: number }
  | { readonly reason: "malformed"; readonly status: number };
```

- `reason: "brand_mismatch"` — the ID has a valid structure but belongs to a different brand;
  default `status` is **404**.
- `reason: "malformed"` — the ID is syntactically invalid; default `status` is **400**.
- `status` reflects any override set via `options.status`, otherwise the default above.

`IdParamFailure` is re-exported from `@smonn/ids/express` — no separate import from
`"@smonn/ids"` is needed.

The 400 vs 404 defaults match the [Hono adapter](/adapters/hono/):
`reason: "brand_mismatch"` → 404, `reason: "malformed"` → 400. The canonical
`Id<Brand>` is stored in `res.locals` under the param name.
