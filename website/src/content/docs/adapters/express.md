---
title: Express adapter
description: Validate route and query-string params against an @smonn/ids codec in Express.
---

`@smonn/ids/express` provides the `idParam` and `idQuery` factories for Express.
Express is an **optional peer dependency**.

```bash
pnpm add express
```

## `idParam` — route params

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
- **`options.onError`:** when provided, the hook is called on validation failure.
  If the hook sends a response (`res.headersSent`), the adapter takes no further
  action. If the hook does not respond — including if it calls `next()` instead of
  `next(err)` — the adapter calls `next(new IdParamError(...))`, so the route
  handler never runs with an invalid ID.
- **`options.status`:** remaps the default HTTP status for a failure reason.

## `idQuery` — query-string params

```ts
import { idQuery, IdParamError } from "@smonn/ids/express";
import { createTimestampId } from "@smonn/ids";

const usr = createTimestampId("usr");

// GET /users?userId=usr_...
app.get("/users", idQuery("userId", usr), (req, res) => {
  const userId = res.locals.userId; // Id<"usr">, canonical
});

// Override: consumer fully owns the error response
app.get(
  "/search",
  idQuery("cursor", usr, {
    onError: (failure, req, res) => res.status(failure.status).json({ error: failure.reason }),
  }),
  handler,
);
```

Same options shape and failure contract as `idParam` — same `IdParamOptions`,
same `IdParamError` forwarded to `next(err)`, same `onError` / `status` — but
reads `req.query[name]` instead of `req.params[name]`. A missing query param is
treated as malformed (status 400). The canonical `Id<Brand>` is stored in
`res.locals` under the query name.

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

## Signature verification

Pass `verify: true` together with a **Signed Timestamp codec** to authenticate the HMAC tag after structural parsing succeeds. TypeScript enforces this at the call site via function overloads — `{ verify: true }` is a type error when paired with a non-verifiable codec.

```ts
import { idParam } from "@smonn/ids/express";
import { createSignedTimestampId, importSigningKey } from "@smonn/ids";

const key = await importSigningKey(new Uint8Array(32));
const usr = createSignedTimestampId("usr", { keys: [key] });

app.get("/users/:id", idParam("id", usr, { verify: true }), (req, res) => {
  const id = res.locals.id; // Id<"usr">, structurally parsed AND HMAC-verified
});
```

When `verify: true` is set:

1. The adapter first runs `codec.safeParse` — a parse failure follows the normal error channel (brand mismatch → 404, malformed → 400).
2. If parsing succeeds, `codec.safeVerify(raw)` is called asynchronously. A tag failure is treated as `reason: "malformed"` and routed through the same error channel (status 400 by default, overrideable via `options.status.malformed`).

Without `verify: true`, the adapter calls only `safeParse` — the default behaviour is byte-for-byte unchanged and no async work is added.
