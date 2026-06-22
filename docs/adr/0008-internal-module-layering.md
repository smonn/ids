# Internal module layering for wire parsing, byte layouts, and the CLI boundary

Codec variants share wire parsing (`is`, `parse`, `safeParse`, `~standard`) but differ in byte layout and public capability surface. Internal modules are split into **`wire/`** (payload envelope, canonical parse, shared timestamp bytes, codec shell) and **`layouts/`** (per-variant 16-byte semantics). Codec constructors (`timestamp.ts`, `opaque.ts`) are thin composition roots; the CLI layer (`cli.ts` plus `cli/`) owns argv/env/stdout and constructs codecs through the **variant registry** (`cli/variants.ts` + `cli/dispatch.ts`) rather than importing each `create*Id` directly — so adding the next codec variant to the CLI only requires one registry descriptor entry. Nothing in `wire/` or `layouts/` is exported from the package.

## Considered Options

- **`wireMethods` in a fat `shared.ts`** — rejected: deduplicates assembly but leaves codec constructors importing `base32` directly and mixing layout logic with envelope assembly; dependency direction stays muddy.
- **Uniform internal `VariantMethods` interface** — rejected: public codec types already diverge per [ADR-0006](./0006-async-keyed-codec-contract.md); Digest may omit `extractTimestamp` entirely; forcing one interface creates no-ops or lies.
- **Public `@smonn/ids/wire` subpath** — rejected for now: adapters use `codec["~standard"]`; parse-without-codec can ship later if a concrete adapter need appears.

## Module rings

```text
cli.ts + cli/                       ← argv, env, stdout; constructs codecs via variant registry
  ↓ (variants.ts + dispatch.ts + key-io.ts)
timestamp.ts / opaque.ts / …        ← validateBrand, registerBrand, inject defaults, key helpers
  ├→ wire/codec-shell.ts            ← wireMethods(prefix)
  └→ layouts/<variant>.ts           ← create*LayoutOps(prefix, …)
        ↓
      wire/invariants.ts, wire/envelope.ts, wire/timestamp-bytes.ts
        ↓
      base32, bytes, types          ← leaves
  brand.ts, registry.ts             ← peer leaves (codec constructors only)

opaque-key.ts / wrapping-key.ts / signing-key.ts   ← key-handle modules (imported by codec constructors)
  ↓
key-material.ts                     ← shared key-material leaf (format/length/encode/decode)
  ↓
  bytes, error                      ← leaves

express.ts / fastify.ts / hono.ts   ← web framework adapters
  ↓
adapter-types.ts                    ← shared web-adapter type hub
  ↓
types.ts / error.ts                 ← leaves
```

`drizzle.ts`, `prisma.ts`, and `kysely.ts` all import `readIdColumn` (and `IdColumnCodec`) from `adapter-types.ts` directly.

`kysely.ts` imports `readIdColumn` and `IdColumnCodec` directly from `adapter-types.ts` (not via `drizzle.ts`). Routing through `drizzle.ts` was explicitly rejected: `readIdColumn` is a value (not erased at compile time), so importing it from `drizzle.ts` would pull `drizzle-orm` into the kysely adapter's module graph, forcing `@smonn/ids/kysely` consumers to install `drizzle-orm`. The `kysely-adapter-no-internals` depcruise rule reflects this: `drizzle` is no longer in the allowlist — only `types`, `error`, and `adapter-types`.

Codec constructors import **`wire/codec-shell`** separately from **`layouts/<variant>`** — the diagram shows two composition edges, not a single chain through layouts into all of `wire/`.

**`registry.ts`** is shell-only (dev duplicate-brand warnings). Pure **`brand.ts`** holds `validateBrand`. Only codec constructors import both.

Within **`wire/`**, `invariants` and `timestamp-bytes` are leaves; `parse` imports `invariants`, `base32`, and `types`; `envelope` imports `base32` and `types` only; `codec-shell` composes `parse` + `invariants`. Codec constructors import **`wire/codec-shell` only** from `wire/`.

The CLI layer stays on the public codec-facing surface: commands construct codecs through the **variant registry** (`cli/variants.ts` + `cli/dispatch.ts`), which calls the appropriate `create*Id` constructor internally. All key I/O flows through **`cli/key-io.ts`** and the registry's `KeyFacet` entries — there are no longer per-variant key modules in the CLI ring. Commands must not import **`wire/`**, **`layouts/`**, or lower-level helpers such as `brand`, `registry`, `base32`, or `bytes` directly.

### Layout ops binder (canonical composition pattern)

Each `layouts/<variant>.ts` exports a single binder — `createTimestampLayoutOps`, `createOpaqueLayoutOps`, etc. — consumed by the matching codec constructor. The binder closes over variant inputs (`prefix`, `rng`, and for Opaque Timestamp `key`), owns any per-codec scratch state, and returns the layout methods the public codec surface needs (`generateAt`, `extractTimestamp`, and variant-specific helpers such as `minIdForTime` / `exampleWireId`). Codec constructors bind `now()` and wire methods; they do not import layout helpers or wire internals directly.

### Responsibilities

| Module                    | Role                                                                                                                                                                                                                                                                                                                                   |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `wire/invariants.ts`      | Shared wire constants (`payloadByteLength`, `payloadBase32Length`, `base32CharClass`)                                                                                                                                                                                                                                                  |
| `wire/parse.ts`           | Canonical normalization at the boundary (`safeParse`, `is`); Standard Schema validate                                                                                                                                                                                                                                                  |
| `wire/envelope.ts`        | Payload ↔ base32; `toWireId` / `payloadBytesFromId` (trust-the-type)                                                                                                                                                                                                                                                                   |
| `wire/timestamp-bytes.ts` | 6-byte big-endian ms read/write; partial base32 suffix decode for timestamp extraction                                                                                                                                                                                                                                                 |
| `wire/codec-shell.ts`     | `wireMethods(prefix)` — wire surface shared by all variants                                                                                                                                                                                                                                                                            |
| `layouts/timestamp.ts`    | `createTimestampLayoutOps` — scratch buffer, generate/extract/min/max/exampleWireId                                                                                                                                                                                                                                                    |
| `layouts/opaque.ts`       | `createOpaqueLayoutOps` — AES-CBC encrypt/decrypt; builds plaintext via `wire/timestamp-bytes`                                                                                                                                                                                                                                         |
| `key-material.ts`         | Key-material leaf — shared format/length validation, hex/base64url encode/decode, and keyring non-emptiness/duplicate-entry assertion helpers, all parameterized by noun; imported only by `opaque-key.ts`, `wrapping-key.ts`, `signing-key.ts` (the per-codec key-handle modules imported by codec constructors, not by CLI commands) |
| `adapter-types.ts`        | Shared web-adapter type hub — exports `IdParamFailure` discriminated union and the shared read helper `readIdColumn`; imported by `express.ts`, `fastify.ts`, `hono.ts`, `drizzle.ts`, `prisma.ts`, and `kysely.ts`; imports from `types.ts` and `error.ts`                                                                            |

## Consequences

- Adding a codec variant means `layouts/<variant>.ts` (export `create*LayoutOps`) + `<variant>.ts` codec constructor + subpath export ([ADR-0005](./0005-codec-variant-subpath-exports.md)) — no changes to parse or envelope.
- `layouts/*` must not import sibling layouts; the Opaque Timestamp layout depends on `wire/timestamp-bytes`, not `layouts/timestamp`.
- Codec constructors must not import `base32` directly — envelope owns payload encoding. Codec constructors import `wire/codec-shell` only from `wire/`, and `create*LayoutOps` binders only from `layouts/`.
- CLI commands construct codecs via the **variant registry** (`cli/variants.ts` + `cli/dispatch.ts`); adding a new codec variant to the CLI means one registry descriptor entry + adding it to the relevant `selectable[]` arrays (+ a new `inspectMode` case only when its output shape is genuinely new). No `flags.ts` edits, no hand-written conflict checks, no new `cli/<key>.ts` module.
- The CLI layer may import public codec entrypoints from `timestamp.ts` / `opaque.ts` / etc. through `variants.ts` descriptors, but not their internal dependencies directly.
- **dependency-cruiser** enforces the rings in CI; `.dependency-cruiser.cjs` is the source of truth.
- `CONTEXT.md` unchanged — Payload, Byte layout, Prefix already cover the domain; wire/layouts are implementation.
- **`key-material.ts`** is a leaf below the three key-handle modules. It must not import `wire/`, `layouts/`, or any codec constructor. Adding a new keyed codec only requires importing `key-material.ts` from its key-handle module — no re-pasting of format-validation or keyring-assertion logic.
