# Lenient at boundaries, strict everywhere else

`Id<Brand>` denotes a **canonical** ID: lowercase, with Crockford base32 aliases (`o`, `i`, `l`) already resolved, **and the final base32 character must have zero low 2 bits**. The boundary between an untrusted external string and a typed `Id<Brand>` is `parse()` / `safeParse()`; these accept lenient input (mixed case, `o`/`i`/`l` aliases) and return the canonical form. `is()` is strict — it returns `true` only for strings that are already canonical. Once a value carries the `Id<Brand>` type, `===` reliably tests logical equality.

## Payload bits and the final-character padding constraint

A 16-byte (128-bit) payload encoded in 26 Crockford base32 characters uses 130 bits, leaving 2 **surplus (padding) bits** in the 26th character. The encoder always sets these low 2 bits to zero, so canonical output never uses the non-canonical variants. The 8 legal final characters are those whose value (index in the alphabet `0123456789abcdefghjkmnpqrstvwxyz`) is divisible by 4: **`0 4 8 c g m r w`**.

`safeParse()` and `is()` reject any string whose 26th base32 character is not in `[048cgmrw]` with `invalid_base32`. This closes a security gap where the 4 trailing-bit variants of any canonical ID (`…0`, `…1`, `…2`, `…3`) decoded to the **identical** 16-byte payload but all passed validation — violating the uniqueness invariant and enabling dedup-bypass, idempotency-key bypass, and similar attacks.

## Considered Options

- **Lenient `is()`** (rejected) — equivalent to `safeParse().success`. Leaves `Id<Brand>` semantically ambiguous: a value of that type might or might not be canonical, so consumers can't rely on `===` and non-canonical strings can leak into storage if a caller forgets to round-trip through `parse()`.
- **Normalize trailing bits in `safeParse`** (not chosen) — possible, but silently accepting malformed input is surprising and harder to audit. Rejection makes the contract explicit and surfaces the rare case where a caller holds a non-canonical string.

## Consequences

- Always call `safeParse()` / `parse()` at the boundary (incoming URL params, form fields, request bodies). Never assert that a raw external string is already an `Id<Brand>`.
- `is()` is the right guard for trusting an already-typed string (e.g. discriminating across brands within already-validated input). It is the wrong guard for ingesting external input.
- Any ID produced by `generate()` is already canonical and unaffected by this constraint. IDs already stored in consumer databases were always produced by `generate()` and are therefore canonical — no migration is required.
