# Internal module layering for wire parsing and byte layouts

Codec variants share wire parsing (`is`, `parse`, `safeParse`, `~standard`) but differ in byte layout and public capability surface. Internal modules are split into **`wire/`** (payload envelope, canonical parse, shared timestamp bytes, codec shell) and **`layouts/`** (per-variant 16-byte semantics). Factories (`id.ts`, `opaque.ts`) are thin composition roots; `cli.ts` imports factories only. Nothing in `wire/` or `layouts/` is exported from the package.

## Considered Options

- **`wireMethods` in a fat `shared.ts`** — rejected: deduplicates assembly but leaves factories importing `base32` directly and mixing layout logic with envelope assembly; dependency direction stays muddy.
- **Uniform internal `VariantMethods` interface** — rejected: public codec types already diverge per [ADR-0006](./0006-async-keyed-codec-contract.md); Derived may omit `extractTimestamp` entirely; forcing one interface creates no-ops or lies.
- **Public `@smonn/ids/wire` subpath** — rejected for now: adapters use `codec["~standard"]`; parse-without-codec can ship later if a concrete adapter need appears.

## Module rings

```text
cli.ts                          ← argv, env, stdout
  ↓
createId / createOpaqueId       ← validateBrand, registerBrand, inject defaults
  ↓
wire/codec-shell.ts             ← wireMethods(prefix)
  ↓
layouts/<variant>.ts            ← byte semantics (16 bytes in/out)
  ↓
wire/envelope.ts, wire/parse.ts, wire/timestamp-bytes.ts
  ↓
base32, bytes, types, brand.ts  ← leaves
```

**`registry.ts`** is shell-only (dev duplicate-brand warnings). Pure **`brand.ts`** holds `validateBrand`. Only factories import both.

### Responsibilities

| Module | Role |
|--------|------|
| `wire/parse.ts` | Canonical normalization at the boundary (`safeParse`, `is`); Standard Schema validate |
| `wire/envelope.ts` | Payload ↔ base32; `toWireId` / `payloadBytesFromId` (trust-the-type) |
| `wire/timestamp-bytes.ts` | 6-byte big-endian ms read/write — shared by every variant whose **plaintext** starts with a timestamp |
| `wire/codec-shell.ts` | `wireMethods(prefix)` — wire surface shared by all variants |
| `layouts/timestamp.ts` | Timestamp byte layout; writes into factory-owned scratch buffer |
| `layouts/opaque.ts` | AES-CBC encrypt/decrypt; builds plaintext via `wire/timestamp-bytes`, not `layouts/timestamp` |

## Consequences

- Adding a codec variant means `layouts/<variant>.ts` + `<variant>.ts` factory + subpath export ([ADR-0005](./0005-codec-variant-subpath-exports.md)) — no changes to parse or envelope.
- `layouts/*` must not import sibling layouts; Opaque depends on `wire/timestamp-bytes`, not `layouts/timestamp`.
- Factories must not import `base32` directly — envelope owns payload encoding.
- **dependency-cruiser** enforces the rings in CI; `.dependency-cruiser.cjs` is the source of truth.
- `CONTEXT.md` unchanged — Payload, Byte layout, Prefix already cover the domain; wire/layouts are implementation.
