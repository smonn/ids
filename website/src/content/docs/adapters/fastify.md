---
title: Fastify adapter
description: Validate route params against an @smonn/ids codec in Fastify.
---

`@smonn/ids/fastify` provides the `idParam` factory for Fastify. Fastify is an
**optional peer dependency**.

```bash
pnpm add fastify
```

```ts
import { idParam, IdParamError } from "@smonn/ids/fastify";
import { createTimestampId } from "@smonn/ids";

const usr = createTimestampId("usr");

// Default: throws IdParamError → setErrorHandler renders it
fastify.get<{ Params: { id: string } }>(
  "/users/:id",
  { preHandler: idParam("id", usr) },
  (request, reply) => {
    const id = request.params.id; // string; cast with `as Id<"usr">` if needed
  },
);

// Error handler receives the typed error
fastify.setErrorHandler((err, request, reply) => {
  if (err instanceof IdParamError) {
    reply.status(err.statusCode).send({ error: err.reason });
    return;
  }
  reply.send(err);
});
```

- **Default error channel:** on failure the adapter throws `IdParamError`
  carrying `statusCode` and `reason` — Fastify's `setErrorHandler` controls
  rendering.
- **`options.onError`:** when provided, the hook owns the response; the adapter
  does not throw.
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

`IdParamFailure` is re-exported from `@smonn/ids/fastify` — no separate import from
`"@smonn/ids"` is needed.

The 400 vs 404 defaults match the [Hono](/adapters/hono/) and
[Express](/adapters/express/) adapters: `reason: "brand_mismatch"` → 404,
`reason: "malformed"` → 400. The canonical `Id<Brand>` is stored in
`request.params` under the param name.
