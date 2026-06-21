# Internal module layering for wire parsing, byte layouts, and the CLI boundary

Codec variants share wire parsing (`is`, `parse`, `safeParse`, `~standard`) but differ in byte layout and public capability surface. Internal modules are split into **`wire/`** (payload envelope, canonical parse, shared timestamp bytes, codec shell) and **`layouts/`** (per-variant 16-byte semantics). Codec constructors (`timestamp.ts`, `opaque.ts`) are thin composition roots; the CLI layer (`cli.ts` plus `cli/`) owns argv/env/stdout, creates codecs only through `createTimestampId` / `createOpaqueTimestampId`, and may use public Opaque key helpers for key loading and keygen. Nothing in `wire/` or `layouts/` is exported from the package.

## Considered Options

- **`wireMethods` in a fat `shared.ts`** — rejected: deduplicates assembly but leaves codec constructors importing `base32` directly and mixing layout logic with envelope assembly; dependency direction stays muddy.
- **Uniform internal `VariantMethods` interface** — rejected: public codec types already diverge per [ADR-0006](./0006-async-keyed-codec-contract.md); Digest may omit `extractTimestamp` entirely; forcing one interface creates no-ops or lies.
- **Public `@smonn/ids/wire` subpath** — rejected for now: adapters use `codec["~standard"]`; parse-without-codec can ship later if a concrete adapter need appears.

## Module rings

```text
cli.ts + cli/                       ← argv, env, stdout, Opaque key I/O
  ↓
timestamp.ts / opaque.ts            ← validateBrand, registerBrand, inject defaults, Opaque key helpers
  ├→ wire/codec-shell.ts            ← wireMethods(prefix)
  └→ layouts/<variant>.ts           ← create*LayoutOps(prefix, …)
        ↓
      wire/invariants.ts, wire/envelope.ts, wire/timestamp-bytes.ts
        ↓
      base32, bytes, types          ← leaves
  brand.ts, registry.ts             ← peer leaves (codec constructors only)

opaque-key.ts / wrapping-key.ts / signing-key.ts   ← key-handle modules
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

`drizzle.ts` imports `readIdColumn` and `IdColumnCodec` from `adapter-types.ts` (chunk 1 of the ORM read-path consolidation). `prisma.ts` and `kysely.ts` still inline the read guard — those migrations are out of scope until chunks 2 and 3 land.

`kysely.ts` imports `IdColumnCodec` as a type from `drizzle.ts` (permitted by the `kysely-adapter-no-internals` depcruise rule, which explicitly allowlists `drizzle` in the kysely path). Keeping `kysely.ts` unchanged was a non-goal in #183; rather than pulling `IdColumnCodec` out of `drizzle.ts` into a shared module, the deliberate decision was to let `kysely.ts` borrow the type from its existing home. This is a stable trade-off: if the Kysely adapter ever diverges from the Drizzle type surface, the depcruise rule signals the coupling that must be resolved at that point.

Codec constructors import **`wire/codec-shell`** separately from **`layouts/<variant>`** — the diagram shows two composition edges, not a single chain through layouts into all of `wire/`.

**`registry.ts`** is shell-only (dev duplicate-brand warnings). Pure **`brand.ts`** holds `validateBrand`. Only codec constructors import both.

Within **`wire/`**, `invariants` and `timestamp-bytes` are leaves; `parse` imports `invariants`, `base32`, and `types`; `envelope` imports `base32` and `types` only; `codec-shell` composes `parse` + `invariants`. Codec constructors import **`wire/codec-shell` only** from `wire/`.

The CLI layer stays on the public codec-facing surface: commands construct codecs through **`createTimestampId`** / **`createOpaqueTimestampId`** and route Opaque key material through public Opaque key helpers re-exported by **`opaque.ts`**. It must not import **`wire/`**, **`layouts/`**, or lower-level helpers such as `brand`, `registry`, `base32`, `bytes`, or `opaque-key` directly.

### Layout ops binder (canonical composition pattern)

Each `layouts/<variant>.ts` exports a single binder — `createTimestampLayoutOps`, `createOpaqueLayoutOps`, etc. — consumed by the matching codec constructor. The binder closes over variant inputs (`prefix`, `rng`, and for Opaque Timestamp `key`), owns any per-codec scratch state, and returns the layout methods the public codec surface needs (`generateAt`, `extractTimestamp`, and variant-specific helpers such as `minIdForTime` / `exampleWireId`). Codec constructors bind `now()` and wire methods; they do not import layout helpers or wire internals directly.

### Responsibilities

| Module                    | Role                                                                                                                                                                                                                                            |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `wire/invariants.ts`      | Shared wire constants (`payloadByteLength`, `payloadBase32Length`, `base32CharClass`)                                                                                                                                                           |
| `wire/parse.ts`           | Canonical normalization at the boundary (`safeParse`, `is`); Standard Schema validate                                                                                                                                                           |
| `wire/envelope.ts`        | Payload ↔ base32; `toWireId` / `payloadBytesFromId` (trust-the-type)                                                                                                                                                                            |
| `wire/timestamp-bytes.ts` | 6-byte big-endian ms read/write; partial base32 suffix decode for timestamp extraction                                                                                                                                                          |
| `wire/codec-shell.ts`     | `wireMethods(prefix)` — wire surface shared by all variants                                                                                                                                                                                     |
| `layouts/timestamp.ts`    | `createTimestampLayoutOps` — scratch buffer, generate/extract/min/max/exampleWireId                                                                                                                                                             |
| `layouts/opaque.ts`       | `createOpaqueLayoutOps` — AES-CBC encrypt/decrypt; builds plaintext via `wire/timestamp-bytes`                                                                                                                                                  |
| `key-material.ts`         | Key-material leaf — shared format/length validation, hex/base64url encode/decode, and keyring non-emptiness/duplicate-entry assertion helpers, all parameterized by noun; imported only by `opaque-key.ts`, `wrapping-key.ts`, `signing-key.ts` |
| `adapter-types.ts`        | Shared web-adapter type hub — exports `IdParamFailure` discriminated union and the shared ORM read guard `readIdColumn`; imported only by `express.ts`, `fastify.ts`, `hono.ts`, and `drizzle.ts`; imports from `types.ts` and `error.ts`       |

## Consequences

- Adding a codec variant means `layouts/<variant>.ts` (export `create*LayoutOps`) + `<variant>.ts` codec constructor + subpath export ([ADR-0005](./0005-codec-variant-subpath-exports.md)) — no changes to parse or envelope.
- `layouts/*` must not import sibling layouts; the Opaque Timestamp layout depends on `wire/timestamp-bytes`, not `layouts/timestamp`.
- Codec constructors must not import `base32` directly — envelope owns payload encoding. Codec constructors import `wire/codec-shell` only from `wire/`, and `create*LayoutOps` binders only from `layouts/`.
- The CLI layer may import public codec entrypoints and Opaque key helpers from `timestamp.ts` / `opaque.ts`, but not their internal dependencies directly.
- **dependency-cruiser** enforces the rings in CI; `.dependency-cruiser.cjs` is the source of truth.
- `CONTEXT.md` unchanged — Payload, Byte layout, Prefix already cover the domain; wire/layouts are implementation.
- **`key-material.ts`** is a leaf below the three key-handle modules. It must not import `wire/`, `layouts/`, or any codec constructor. Adding a new keyed codec only requires importing `key-material.ts` from its key-handle module — no re-pasting of format-validation or keyring-assertion logic.
