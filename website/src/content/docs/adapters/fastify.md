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

The 400 vs 404 defaults match the [Hono](/adapters/hono/) and
[Express](/adapters/express/) adapters: `reason: "brand_mismatch"` → 404,
`reason: "malformed"` → 400. The canonical `Id<Brand>` is stored in
`request.params` under the param name.
