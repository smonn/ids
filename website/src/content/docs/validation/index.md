---
title: Validation (Standard Schema & JSON Schema)
description: Every @smonn/ids codec implements Standard Schema v1 (~standard) and exports a JSON Schema via toJsonSchema() — both available on every codec variant, sync even on keyed codecs.
---

Every codec — Timestamp, Reverse Timestamp, Signed Timestamp, Opaque Timestamp,
Wrapped key, and Digest — exposes two shared validation surfaces:

- **`~standard`** — [Standard Schema v1](https://standardschema.dev/) support,
  letting any codec drop directly into ArkType, Valibot, tRPC, and other
  Standard Schema-compatible libraries without hand-rolling a `refine` callback.
- **`toJsonSchema()`** — synchronous JSON Schema export for OpenAPI document
  generation, JSON Schema validators, and documentation tooling.

Both surfaces work on the **wire form only** — they validate prefix and base32
shape, require no key material, and are fully **synchronous** on every codec,
including keyed ones (Opaque Timestamp, Wrapped key, Signed Timestamp, Digest)
where key-dependent operations are async.

## Standard Schema (`~standard`)

Each codec's `~standard` property implements
[Standard Schema v1](https://standardschema.dev/):

```ts
codec["~standard"].version; // 1
codec["~standard"].vendor; // "@smonn/ids"
codec["~standard"].validate(value);
// → { value: Id<Brand> } on success
// → { issues: Array<{ message: string }> } on failure
```

### Shape

| Property   | Value              | Notes                                         |
| ---------- | ------------------ | --------------------------------------------- |
| `version`  | `1`                | Fixed — Standard Schema protocol version      |
| `vendor`   | `"@smonn/ids"`     | Fixed — identifies this library               |
| `validate` | `(unknown) => ...` | Sync; wraps `safeParse`; returns canonical ID |

### `validate` return types

| Outcome | Return shape                                   |
| ------- | ---------------------------------------------- |
| Valid   | `{ value: Id<Brand> }` (`issues` is undefined) |
| Invalid | `{ issues: [{ message: string }, ...] }`       |

`validate` accepts the same mixed-case and Crockford visual aliases
(`o → 0`, `i → 1`, `l → 1`) that `safeParse` does, and returns the
**canonical** `Id<Brand>` on success. Each failure maps to a distinct message:

| ParseError       | `issues[0].message`        |
| ---------------- | -------------------------- |
| `not_string`     | `"expected string"`        |
| `invalid_prefix` | `"expected prefix 'usr_'"` |
| `invalid_base32` | `"invalid base32 payload"` |

### Worked example — ArkType

Any Standard Schema v1-compatible library accepts a codec directly as a schema
member. For example, with [ArkType](https://arktype.io/):

```ts
import { type } from "arktype";
import { createTimestampId } from "@smonn/ids";

const users = createTimestampId("usr");

const Body = type({ userId: users });

const r = Body({ userId: "USR_01H7B3K9RQXN1CW3P9R8T2SGKW" });
// → { userId: "usr_01h7b3k9rqxn1cw3p9r8t2sgkw" } typed as { userId: Id<"usr"> }
```

The same pattern works with Valibot, tRPC, and any other library that reads the
`~standard` property. Consult each library's Standard Schema integration docs
for its exact syntax.

### Direct use

If a library does not yet support Standard Schema, call `validate` directly:

```ts
const result = users["~standard"].validate(req.body.userId);

if ("issues" in result) {
  return res.status(400).json({ error: result.issues[0].message });
}

const userId = result.value; // Id<"usr">, canonical
```

## JSON Schema (`toJsonSchema()`)

`toJsonSchema()` returns a plain object describing the canonical wire form:

```ts
users.toJsonSchema();
// {
//   type: "string",
//   pattern: "^usr_[0-9a-hjkmnp-tv-z]{25}[048cgmrw]$",
//   description: "Branded ID for 'usr'",
//   example: "usr_01h7b3k9rqxn1cw3p9r8t2sgkw",
// }
```

### Output shape

| Field         | Type     | Notes                                                            |
| ------------- | -------- | ---------------------------------------------------------------- |
| `type`        | `string` | Always `"string"`                                                |
| `pattern`     | `string` | Anchored regex matching the canonical form only — see note below |
| `description` | `string` | `"Branded ID for '<brand>'"` — includes the brand literal        |
| `example`     | `string` | A freshly generated canonical ID — changes on every call         |

### `pattern` is canonical-form-only

The regex matches `generate()` output and `is()` — **not** the lenient forms
accepted by `safeParse()`. Uppercase letters and Crockford visual aliases
(`O`, `I`, `L`) do not match. The final character is constrained to one of
`[048cgmrw]` because 16 bytes encoded in 26 Crockford base32 characters
(130 bits) leave 2 surplus padding bits; canonical encoding sets them to zero.
See [ADR-0003](https://github.com/smonn/ids/blob/main/docs/adr/0003-canonical-strict-is.md).

### `example` is freshly generated per call

`example` is a real, always-valid canonical ID generated on each
`toJsonSchema()` call. It always satisfies the returned `pattern`.

### OpenAPI usage

Drop the result straight into an OpenAPI `components.schemas` entry:

```ts
const schema = users.toJsonSchema();

// in your OpenAPI document builder:
components.schemas.UserId = schema;
// → { type: "string", pattern: "^usr_...$", description: "...", example: "..." }
```

## Availability on keyed codecs

Both surfaces are available — and **synchronous** — on every codec variant:

| Codec             | `~standard` | `toJsonSchema()` | Notes                                              |
| ----------------- | ----------- | ---------------- | -------------------------------------------------- |
| Timestamp         | sync        | sync             |                                                    |
| Reverse Timestamp | sync        | sync             |                                                    |
| Signed Timestamp  | sync        | sync             | `generate` / `verify` are async; these two are not |
| Opaque Timestamp  | sync        | sync             | `generate` / `extractTimestamp` are async          |
| Wrapped key       | sync        | sync             | `wrap` / `unwrap` are async                        |
| Digest            | sync        | sync             | `digest` is async                                  |

Neither surface reads the payload — they validate prefix and base32 structure
only — so no key is needed and there is nothing to await.
