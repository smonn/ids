---
title: Fastify adapter
description: Validate route and query-string params against an @smonn/ids codec in Fastify.
---

`@smonn/ids/fastify` provides the `idParam` and `idQuery` factories for Fastify.
Fastify is an **optional peer dependency**.

```bash
pnpm add fastify
```

## `idParam` — route params

```ts
import { idParam, IdParamError } from "@smonn/ids/fastify";
import { createTimestampId } from "@smonn/ids";

const usr = createTimestampId("usr");

// Default: throws IdParamError → setErrorHandler renders it
fastify.get("/users/:id", { preHandler: idParam("id", usr) }, (request, reply) => {
  const id = request.params.id; // string (compile-time); Id<"usr"> at runtime after preHandler
});

// Error handler receives the typed error
fastify.setErrorHandler((err, request, reply) => {
  if (err instanceof IdParamError) {
    reply.status(err.statusCode).send({ error: err.reason });
    return;
  }
  reply.send(err);
});
```

**`--strictFunctionTypes` note:** `idParam` returns a hook typed as
`(request: FastifyRequest<{ Params: Record<string, Id<Brand>> }>, reply: FastifyReply) => Promise<void>`.
Assigning it directly to a `preHandler` slot is safe — TypeScript's
method-signature bivariance applies to Fastify's `preHandler` slot definition. If you instead store the hook in a
locally-annotated variable typed as the bare
`(request: FastifyRequest, reply: FastifyReply) => Promise<void>`,
TypeScript will report an error under `--strictFunctionTypes` because function
parameter types are contravariant. Avoid the explicit annotation and let
TypeScript infer, or use `preHandler` slot assignment directly.

- **Default error channel:** on failure the adapter throws `IdParamError`
  carrying `statusCode` and `reason` — Fastify's `setErrorHandler` controls
  rendering.
- **`options.onError`:** when provided, the adapter awaits the hook on validation
  failure. If the hook sends a response (`reply.sent`), the adapter takes no
  further action. If the hook does not respond, the adapter throws `IdParamError`,
  so the route handler never runs with an invalid ID.
- **`options.status`:** remaps the default HTTP status for a failure reason.

## `idQuery` — query-string params

```ts
import { idQuery, IdParamError } from "@smonn/ids/fastify";
import { createTimestampId } from "@smonn/ids";

const usr = createTimestampId("usr");

// GET /users?userId=usr_...
fastify.get("/users", { preHandler: idQuery("userId", usr) }, (request, reply) => {
  const userId = request.query.userId; // string (compile-time); Id<"usr"> at runtime
});

// Override: consumer fully owns the error response
fastify.get(
  "/search",
  {
    preHandler: idQuery("cursor", usr, {
      onError: (failure, request, reply) =>
        reply.status(failure.status).send({ error: failure.reason }),
    }),
  },
  handler,
);
```

Same options shape and failure contract as `idParam` — same `IdParamOptions`,
same `IdParamError` thrown into `setErrorHandler`, same `onError` / `status` —
but reads `request.query[name]` instead
of `request.params[name]`. A missing query param is treated as malformed (status
400). The canonical `Id<Brand>` is stored in `request.query` under the query name.

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

## Signature verification

Pass `verify: true` together with a **Signed Timestamp codec** or a **Wrapped key codec** to authenticate the tag after structural parsing succeeds. TypeScript enforces this at the call site via function overloads — `{ verify: true }` is a type error when paired with a non-verifiable codec (Timestamp, Opaque, Reverse Timestamp, Digest).

```ts
import { idParam } from "@smonn/ids/fastify";
import { createSignedTimestampId, importSigningKey } from "@smonn/ids";

const key = await importSigningKey(new Uint8Array(32));
const usr = createSignedTimestampId("usr", { keys: [key] });

fastify.get(
  "/users/:id",
  { preHandler: idParam("id", usr, { verify: true }) },
  (request, reply) => {
    const id = request.params.id; // Id<"usr"> at runtime, structurally parsed AND HMAC-verified
  },
);
```

When `verify: true` is set:

1. The adapter first runs `codec.safeParse` — a parse failure follows the normal error channel (brand mismatch → 404, malformed → 400).
2. If parsing succeeds, `codec.safeVerify(raw)` is awaited. A tag failure is treated as `reason: "malformed"` and routed through the same error channel (status 400 by default, overrideable via `options.status.malformed`).

For the **Signed Timestamp codec**, `safeVerify` checks the HMAC tag. For the **Wrapped key codec**, `safeVerify` is a verify-only alias of `safeUnwrap` (it drops the recovered lookup key); a wrong-key, tampered, or revoked-key ID surfaces as the same `"malformed"` failure.

Without `verify: true`, the adapter calls only `safeParse` — the default behaviour is byte-for-byte unchanged and no async work is added.
