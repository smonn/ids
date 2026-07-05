---
title: Hono adapter
description: Validate route and query-string params against an @smonn/ids codec in Hono.
---

`@smonn/ids/hono` provides `idParam` and `idQuery` — middleware factories that validate
a named route param or query-string param against a codec and expose the canonical
`Id<Brand>` to the handler. Hono is an **optional peer dependency**.

```bash
pnpm add hono
```

## `idParam` — route params

```ts
import { idParam, IdParamError } from "@smonn/ids/hono";
import { createTimestampId } from "@smonn/ids";

const usr = createTimestampId("usr");
const org = createTimestampId("org");
const thing = createTimestampId("thg");
const handler = (c) => c.json({ ok: true });

// Default: throws IdParamError (extends HTTPException) → app.onError handles rendering
app.get("/users/:id", idParam("id", usr), (c) => {
  const id = c.get("id"); // Id<"usr">, canonical
});

// Discriminate by reason in app.onError
app.onError((err, c) => {
  if (err instanceof IdParamError) {
    return c.json({ error: err.reason }, err.status); // err.reason: "brand_mismatch" | "malformed"
  }
  return c.json({ error: "internal" }, 500);
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

- **Default error channel:** on failure the adapter throws `IdParamError` (extends `HTTPException`)
  carrying both the HTTP `status` and a discriminating `reason` field — it does **not** write a
  body itself, so your existing `app.onError` controls content negotiation and can branch on
  `err.reason`.
- **`options.onError`:** when provided, the hook owns the response entirely.
- **`options.status`:** remaps the default HTTP status for a failure reason.

## `idQuery` — query-string params

```ts
import { idQuery, IdParamError } from "@smonn/ids/hono";
import { createTimestampId } from "@smonn/ids";

const usr = createTimestampId("usr");

// Default: throws IdParamError (extends HTTPException) → app.onError handles rendering
// GET /users?userId=usr_...
app.get("/users", idQuery("userId", usr), (c) => {
  const userId = c.get("userId"); // Id<"usr">, canonical
});

// Discriminate by reason in app.onError
app.onError((err, c) => {
  if (err instanceof IdParamError) {
    return c.json({ error: err.reason }, err.status); // err.reason: "brand_mismatch" | "malformed"
  }
  return c.json({ error: "internal" }, 500);
});

// Override: consumer fully owns the error response
app.get(
  "/search",
  idQuery("cursor", usr, {
    onError: (failure, c) => c.json({ error: failure.reason }, failure.status),
  }),
  handler,
);
```

Same options shape and failure contract as `idParam` — same `IdParamOptions`, same
`IdParamFailure`, same `onError` / `status` — but reads `c.req.query(name)` instead
of `c.req.param(name)`. A missing query param is treated as malformed (status 400).

## `IdParamError`

`IdParamError extends HTTPException` is the typed error thrown by `idParam` and `idQuery`
on the default (no-`onError`) path. It carries:

- **`err.reason`** — `"brand_mismatch"` or `"malformed"` — the discriminator your
  `app.onError` can branch on even when `options.status` has remapped both reasons to
  the same HTTP status code.
- **`err.status`** — the HTTP status code (reflects any `options.status` override).
- **`err.name`** — `"IdParamError"` for readable stack traces and `instanceof` clarity.

```ts
import { IdParamError } from "@smonn/ids/hono";

app.onError((err, c) => {
  if (err instanceof IdParamError) {
    if (err.reason === "brand_mismatch") {
      return c.json({ error: "resource not found" }, 404);
    }
    return c.json({ error: "malformed ID" }, 400);
  }
  return c.json({ error: "internal" }, 500);
});
```

`IdParamError` is exported from `@smonn/ids/hono` — no separate import from `@smonn/ids`
is needed. Because it extends `HTTPException`, existing `instanceof HTTPException` checks
continue to work.

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

`IdParamFailure` is re-exported from `@smonn/ids/hono` — no separate import from
`"@smonn/ids"` is needed.

## Signature verification

Pass `verify: true` together with a **Signed Timestamp codec** or a **Wrapped key codec** to authenticate the tag after structural parsing succeeds. TypeScript enforces this at the call site via function overloads — `{ verify: true }` is a type error when paired with a non-verifiable codec (Timestamp, Opaque, Reverse Timestamp, Digest).

```ts
import { idParam } from "@smonn/ids/hono";
import { createSignedTimestampId, importSigningKey } from "@smonn/ids/signed";

const key = await importSigningKey(new Uint8Array(32));
const usr = createSignedTimestampId("usr", { keys: [key] });

app.get("/users/:id", idParam("id", usr, { verify: true }), (c) => {
  const id = c.get("id"); // Id<"usr">, structurally parsed AND HMAC-verified
});
```

When `verify: true` is set:

1. The adapter first runs `codec.safeParse` — a parse failure follows the normal error channel (brand mismatch → 404, malformed → 400).
2. If parsing succeeds, `codec.safeVerify(raw)` is awaited. A tag failure is treated as `reason: "malformed"` and routed through the same error channel (status 400 by default, overrideable via `options.status.malformed`).

For the **Signed Timestamp codec**, `safeVerify` checks the HMAC tag. For the **Wrapped key codec**, `safeVerify` is a verify-only alias of `safeUnwrap` (it drops the recovered lookup key); a wrong-key, tampered, or revoked-key ID surfaces as the same `"malformed"` failure.

Without `verify: true`, the adapter calls only `safeParse` — the default behaviour is byte-for-byte unchanged and no async work is added.

## 400 vs 404 defaults

- **Brand mismatch** (`invalid_prefix`) → `reason: "brand_mismatch"`, status
  **404**. A `usr_` ID makes no sense on `/orders/:id` — the resource cannot
  exist under this route.
- **Malformed or missing ID** (`invalid_base32` / `not_string`) →
  `reason: "malformed"`, status **400**.

`idParam` calls `safeParse` at the boundary (lenient: mixed case and Crockford
aliases), so the handler always receives a canonical, normalized `Id<Brand>`.
Works with any codec variant's structural `safeParse`.
