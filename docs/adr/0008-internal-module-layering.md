# Internal module layering for wire parsing and byte layouts

Codec variants share wire parsing (`is`, `parse`, `safeParse`, `~standard`) but differ in byte layout and public capability surface. Internal modules are split into **`wire/`** (payload envelope, canonical parse, shared timestamp bytes, codec shell) and **`layouts/`** (per-variant 16-byte semantics). Codec constructors (`id.ts`, `opaque.ts`) are thin composition roots; `cli.ts` imports codec constructors only. Nothing in `wire/` or `layouts/` is exported from the package.

## Considered Options

- **`wireMethods` in a fat `shared.ts`** — rejected: deduplicates assembly but leaves codec constructors importing `base32` directly and mixing layout logic with envelope assembly; dependency direction stays muddy.
- **Uniform internal `VariantMethods` interface** — rejected: public codec types already diverge per [ADR-0006](./0006-async-keyed-codec-contract.md); Derived may omit `extractTimestamp` entirely; forcing one interface creates no-ops or lies.
- **Public `@smonn/ids/wire` subpath** — rejected for now: adapters use `codec["~standard"]`; parse-without-codec can ship later if a concrete adapter need appears.

## Module rings

```text
cli.ts                              ← argv, env, stdout
  ↓
createId / createOpaqueId           ← validateBrand, registerBrand, inject defaults
  ├→ wire/codec-shell.ts            ← wireMethods(prefix)
  └→ layouts/<variant>.ts           ← create*LayoutOps(prefix, …)
        ↓
      wire/invariants.ts, wire/envelope.ts, wire/timestamp-bytes.ts
        ↓
      base32, bytes, types          ← leaves
  brand.ts, registry.ts             ← peer leaves (codec constructors only)
```

Codec constructors import **`wire/codec-shell`** separately from **`layouts/<variant>`** — the diagram shows two composition edges, not a single chain through layouts into all of `wire/`.

**`registry.ts`** is shell-only (dev duplicate-brand warnings). Pure **`brand.ts`** holds `validateBrand`. Only codec constructors import both.

Within **`wire/`**, `invariants` and `timestamp-bytes` are leaves; `parse` imports `invariants`, `base32`, and `types`; `envelope` imports `base32` and `types` only; `codec-shell` composes `parse` + `invariants`. Codec constructors import **`wire/codec-shell` only** from `wire/`.

### Layout ops binder (canonical composition pattern)

Each `layouts/<variant>.ts` exports a single binder — `createTimestampLayoutOps`, `createOpaqueLayoutOps`, etc. — consumed by the matching codec constructor. The binder closes over variant inputs (`prefix`, `rng`, and for Opaque `key`), owns any per-codec scratch state, and returns the layout methods the public codec surface needs (`generateAt`, `extractTimestamp`, and variant-specific helpers such as `minIdForTime` / `exampleWireId`). Codec constructors bind `now()` and wire methods; they do not import layout helpers or wire internals directly.

### Responsibilities

| Module                    | Role                                                                                           |
| ------------------------- | ---------------------------------------------------------------------------------------------- |
| `wire/invariants.ts`      | Shared wire constants (`payloadByteLength`, `payloadBase32Length`, `base32CharClass`)          |
| `wire/parse.ts`           | Canonical normalization at the boundary (`safeParse`, `is`); Standard Schema validate          |
| `wire/envelope.ts`        | Payload ↔ base32; `toWireId` / `payloadBytesFromId` (trust-the-type)                           |
| `wire/timestamp-bytes.ts` | 6-byte big-endian ms read/write; partial base32 suffix decode for timestamp extraction         |
| `wire/codec-shell.ts`     | `wireMethods(prefix)` — wire surface shared by all variants                                    |
| `layouts/timestamp.ts`    | `createTimestampLayoutOps` — scratch buffer, generate/extract/min/max/exampleWireId            |
| `layouts/opaque.ts`       | `createOpaqueLayoutOps` — AES-CBC encrypt/decrypt; builds plaintext via `wire/timestamp-bytes` |

## Consequences

- Adding a codec variant means `layouts/<variant>.ts` (export `create*LayoutOps`) + `<variant>.ts` codec constructor + subpath export ([ADR-0005](./0005-codec-variant-subpath-exports.md)) — no changes to parse or envelope.
- `layouts/*` must not import sibling layouts; Opaque depends on `wire/timestamp-bytes`, not `layouts/timestamp`.
- Codec constructors must not import `base32` directly — envelope owns payload encoding. Codec constructors import `wire/codec-shell` only from `wire/`, and `create*LayoutOps` binders only from `layouts/`.
- **dependency-cruiser** enforces the rings in CI; `.dependency-cruiser.cjs` is the source of truth.
- `CONTEXT.md` unchanged — Payload, Byte layout, Prefix already cover the domain; wire/layouts are implementation.
