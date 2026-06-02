---
"@smonn/ids": minor
---

Each `Codec<Brand>` now implements [Standard Schema v1](https://standardschema.dev/) via a `~standard` property, so a codec can be passed directly to any validator that consumes Standard Schema (Zod, Valibot, ArkType, tRPC inputs, Hono, etc.). `validate` is synchronous, wraps `safeParse`, and returns the canonical `Id<Brand>` on success. Each `ParseError` variant maps to a distinct, human-readable message: `not_string` → `"expected string"`, `invalid_prefix` → `"expected prefix '<brand>_'"`, `invalid_base32` → `"invalid base32 payload"`. No runtime dependency; the spec types are inlined.
