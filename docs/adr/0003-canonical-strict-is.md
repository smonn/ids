# Lenient at boundaries, strict everywhere else

`Id<Brand>` denotes a **canonical** ID: lowercase, with Crockford base32 aliases (`o`, `i`, `l`) already resolved. The boundary between an untrusted external string and a typed `Id<Brand>` is `parse()` / `safeParse()`; these accept lenient input (mixed case, `o`/`i`/`l` aliases) and return the canonical form. `is()` is strict — it returns `true` only for strings that are already canonical. Once a value carries the `Id<Brand>` type, `===` reliably tests logical equality.

## Considered Options

- **Lenient `is()`** (rejected) — equivalent to `safeParse().success`. Leaves `Id<Brand>` semantically ambiguous: a value of that type might or might not be canonical, so consumers can't rely on `===` and non-canonical strings can leak into storage if a caller forgets to round-trip through `parse()`.

## Consequences

- Always call `safeParse()` / `parse()` at the boundary (incoming URL params, form fields, request bodies). Never assert that a raw external string is already an `Id<Brand>`.
- `is()` is the right guard for trusting an already-typed string (e.g. discriminating across brands within already-validated input). It is the wrong guard for ingesting external input.
