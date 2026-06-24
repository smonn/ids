# By-feature codec slices: `codecs/<name>/`, `codecs/_kernel/`, and `wire/base32` separation

Status: Accepted — implemented by #317 (codec slices + \_kernel + wire/base32 + codec depcruise) and #318 (adapters); supersedes ADR-0008.

## Context

The current `src/` layout is flat at the root. Every codec variant (`timestamp.ts`, `opaque.ts`, `reverse.ts`, `signed.ts`, `wrapped.ts`, `digest.ts`) lives at the same level as its layout module (`layouts/timestamp.ts`, `layouts/opaque.ts`, …), its key-handle module (`opaque-key.ts`, `wrapping-key.ts`, `signing-key.ts`, `digest-key.ts`), and the cross-cutting leaves (`brand.ts`, `registry.ts`, `rng.ts`, `key-material.ts`, `bytes.ts`, `base32.ts`, `types.ts`, `error.ts`).

The maintenance burden concentrates in `.dependency-cruiser.cjs`: approximately 7 rules carry hand-maintained codec-name alternations (e.g. `(timestamp|opaque|reverse|signed|wrapped|digest)`) that must be updated whenever a codec is added. Two rules — `codec-constructors-no-base32` and `layouts-no-base32` — exist solely to prevent codec constructors and layout modules from importing `base32` directly; they become redundant if `base32` moves under `wire/`. A similar fragmentation exists in the per-variant allowlists for kernel leaves, which are repeated across rules rather than derived from directory structure.

## Decision

Reorganize `src/` into by-feature codec slices:

**`codecs/<name>/`** — each codec gets its own closed directory with a fixed file convention:

- `index.ts` — codec constructor (the public entrypoint; current `timestamp.ts` / `opaque.ts` / etc.)
- `layout.ts` — per-variant layout ops binder (current `layouts/<name>.ts`)
- `key.ts` — codec-specific key-handle module (current `opaque-key.ts`, `wrapping-key.ts`, etc.; absent for keyless codecs such as Timestamp and Reverse Timestamp)
- `*.test.ts` — co-located tests

**`codecs/_kernel/`** — codec-family-shared leaves, promoted from the flat root:

- `brand.ts` — `validateBrand`
- `registry.ts` — codec registry (dev duplicate-brand warnings)
- `rng.ts` — random bytes generation
- `key-material.ts` — shared key-material utilities (format/length validation, hex/base64url encode/decode, keyring non-emptiness/duplicate-entry assertions)
- `bytes.ts` — byte array utilities

**`wire/`** — `base32.ts` relocates from the flat `src/` root into `wire/`. The existing `wire/` modules (`invariants.ts`, `parse.ts`, `envelope.ts`, `timestamp-bytes.ts`, `codec-shell.ts`) stay as they are; the relocation consolidates the full wire layer in one place.

**Root universals** — `types.ts` and `error.ts` stay at the `src/` root. They cross every boundary and have no natural codec or adapter owner; hoisting them into a subdirectory would scatter imports for no structural gain.

**`adapters/`** — a peer axis at `src/adapters/` hosts the web-framework adapters (`express.ts`, `fastify.ts`, `hono.ts`), the ORM adapters (`drizzle.ts`, `prisma.ts`, `kysely.ts`), and the shared hub (`adapter-types.ts`). Adapters are a distinct ownership axis from codecs; a peer directory makes the separation structural rather than implicit.

## Enforcement

Codec depcruise enforcement is now directory-based (implemented in #325):

- **Directory-based codec rules** use the `$1` group back-reference (`dependency-cruiser@17.4.3+`) to match `codecs/$1/` paths, so new codec directories are automatically in scope — no alternation strings to update.
- **Filename-convention guard** (`codec-slice-filename-convention`) enforces that each `codecs/<name>/` directory contains only `index.ts`, `layout.ts`, `key.ts`, or `*.test.ts`.
- **Cross-codec isolation** (`codec-slice-no-cross-codec-imports`) prevents one codec slice from importing another; only `codecs/_kernel/` imports are allowed cross-slice.
- **`_kernel` guard** (`_kernel-brand-registry-only-from-codec-constructors`) enforces that `brand` and `registry` are importable only from codec constructors.
- **Zero depcruise edits to add a codec**: dropping `codecs/<newname>/index.ts` (and optionally `layout.ts`, `key.ts`) is sufficient — no `.dependency-cruiser.cjs` edits, no hand-maintained alternation lists. This is verified by the zero-edit proof fixture in `test/fixtures/depcruise/codecs/sample/`.
- **Deleted rules**: `codec-constructors-no-base32` and `layouts-no-base32` were removed in earlier slices. Their constraint is structural: `base32.ts` lives under `wire/`, and codec `index.ts` files import from `_kernel/` and `wire/codec-shell` only.
- **Adapter rules** (`adapters/`) collapse: three per-ORM rules (`drizzle-adapter-no-internals`, `kysely-adapter-no-internals`, `prisma-adapter-no-internals`) are replaced by a single directory-glob rule (`adapters-no-internals`) covering all `src/adapters/` non-hub files — adding a new adapter requires zero depcruise edits, mirroring the codec zero-edit goal.

### Adding a codec variant (zero-edit checklist)

1. Create `src/codecs/<name>/index.ts` — codec constructor (`validateBrand`, `registerBrand`, wire methods, layout ops composition).
2. Create `src/codecs/<name>/layout.ts` — layout ops binder (`create*LayoutOps`).
3. For keyed codecs, create `src/codecs/<name>/key.ts` — key-handle module (`import*Key`, `encode*Key`, `decode*Key`).
4. Add a subpath export to `package.json#exports` and `tsdown.config.ts` ([ADR-0005](./0005-codec-variant-subpath-exports.md)).
5. Register the codec variant in the CLI registry (`src/cli/variants.ts`).
6. **No `.dependency-cruiser.cjs` edits required** — the directory-based rules cover any `codecs/<name>/` automatically.

## Module rings

```text
cli.ts + cli/                          ← argv, env, stdout; constructs codecs via variant registry
  ↓ (variants.ts + dispatch.ts + key-io.ts)
codecs/<name>/index.ts                 ← validateBrand, registerBrand, inject defaults, key helpers
  ├→ codecs/<name>/layout.ts           ← create*LayoutOps(prefix, …)
  ├→ codecs/<name>/key.ts              ← key-handle module (keyed codecs only)
  └→ wire/codec-shell.ts               ← wireMethods(prefix)
        ↓
      wire/invariants.ts, wire/envelope.ts, wire/timestamp-bytes.ts, wire/parse.ts
        ↓
      wire/base32.ts                   ← leaf (relocated from src/ root)

codecs/_kernel/
  brand.ts, registry.ts, rng.ts,
  key-material.ts, bytes.ts           ← codec-family-shared leaves
    ↓
  types.ts, error.ts                  ← root universal leaves

adapters/
  adapter-types.ts                    ← shared web-adapter type hub
  express.ts, fastify.ts, hono.ts     ← web framework adapters
  drizzle.ts, prisma.ts, kysely.ts    ← ORM adapters
    ↓
  types.ts, error.ts                  ← root universal leaves
```

Codec constructors import **`wire/codec-shell`** only from `wire/`, and **`create*LayoutOps`** binders only from their own `layout.ts`. They do not import `wire/` internals (`base32`, `envelope`, `parse`, `timestamp-bytes`, `invariants`) directly.

## Responsibilities

| Module                                                                        | Role                                                                                                                                                                                                                         |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `codecs/<name>/index.ts`                                                      | Codec constructor — validates brand, registers brand, composes wire methods and layout ops into the public codec surface                                                                                                     |
| `codecs/<name>/layout.ts`                                                     | Layout ops binder — closes over variant inputs (`prefix`, `rng`, key material), owns per-codec scratch state, returns `generateAt`, `extractTimestamp`, and variant-specific helpers (`minIdForTime`, `exampleWireId`, etc.) |
| `codecs/<name>/key.ts`                                                        | Key-handle module — `import*Key`, `encode*Key`, `decode*Key` helpers for keyed codecs; absent for keyless variants (Timestamp, Reverse Timestamp)                                                                            |
| `codecs/_kernel/brand.ts`                                                     | `validateBrand` — shared brand-format validation                                                                                                                                                                             |
| `codecs/_kernel/registry.ts`                                                  | Codec registry — dev-time duplicate-brand warnings; shell-only                                                                                                                                                               |
| `codecs/_kernel/rng.ts`                                                       | Random bytes generation — `defaultRng`                                                                                                                                                                                       |
| `codecs/_kernel/key-material.ts`                                              | Shared key-material leaf — format/length validation, hex/base64url encode/decode, keyring non-emptiness/duplicate-entry assertion helpers, all parameterized by noun                                                         |
| `codecs/_kernel/bytes.ts`                                                     | Byte array utilities                                                                                                                                                                                                         |
| `wire/base32.ts`                                                              | Crockford base32 encode/decode (relocated from `src/` root)                                                                                                                                                                  |
| `wire/invariants.ts`                                                          | Shared wire constants (`payloadByteLength`, `payloadBase32Length`, `base32CharClass`)                                                                                                                                        |
| `wire/parse.ts`                                                               | Canonical normalisation at the boundary (`safeParse`, `is`); Standard Schema validate                                                                                                                                        |
| `wire/envelope.ts`                                                            | Payload ↔ base32; `toWireId` / `payloadBytesFromId` (trust-the-type)                                                                                                                                                         |
| `wire/timestamp-bytes.ts`                                                     | 6-byte big-endian ms read/write; partial base32 suffix decode for timestamp extraction                                                                                                                                       |
| `wire/codec-shell.ts`                                                         | `wireMethods(prefix)` — wire surface shared by all codec variants                                                                                                                                                            |
| `adapters/adapter-types.ts`                                                   | Shared web-adapter type hub — exports `IdParamFailure` discriminated union, `readIdColumn`, and `IdColumnCodec`; imports from `types.ts` and `error.ts`                                                                      |
| `adapters/express.ts` / `fastify.ts` / `hono.ts` / `nestjs.ts` / `graphql.ts` | Web framework adapters                                                                                                                                                                                                       |
| `adapters/drizzle.ts` / `prisma.ts` / `kysely.ts` / `typeorm.ts`              | ORM adapters                                                                                                                                                                                                                 |
| `types.ts`                                                                    | Root universal types — `Id<Brand>`, `ParseError`, `ParseResult`, etc.                                                                                                                                                        |
| `error.ts`                                                                    | Root universal error — `IdsError`, `isIdsError`, `IdsErrorCode`                                                                                                                                                              |

## Considered Options

- **Flat root (status quo)** — all modules coexist at `src/` root. Adding a codec means updating ~7 depcruise rule alternation strings by hand. Ownership is implicit; there is no structural enforcement of the closed file convention. Rejected as the baseline to improve upon.
- **Single `core/` leaf directory** — move codec-shared leaves into `src/core/`. Rejected: this only relabels the flat root under a different name and cannot collapse the fine-grained `wire/` allowlists that codec constructors need. The rule count stays the same; the codec-name alternation burden stays the same. Adding a codec still requires rule edits.
- **Owner-grouping (chosen)** — vertical `codecs/<name>/` slices own their constructor, layout, key-handle, and tests together; `codecs/_kernel/` groups shared codec leaves; `wire/` absorbs `base32`; adapters get their own peer axis at `adapters/`. Codec-name alternations in depcruise rules collapse to directory `$1` back-references — **adding a codec or adapter requires zero depcruise edits**.

## Relationship to ADR-0008

This ADR supersedes [ADR-0008](./0008-internal-module-layering.md) once both #317 and #318 land. ADR-0008's ring diagram and responsibilities table describe the current flat-root layout; the new ring diagram and responsibilities table above replace them. ADR-0008's `Superseded by: ADR-0018` header was added in #325 (slice D); once #318 lands, this ADR's Status will flip to `Accepted`, completing the supersession.

## Status lifecycle

The `Status:` field introduced here is a new lightweight convention for ADRs in this repository:

- **`Proposed`**: The decision is recorded and agreed upon, but its implementing PRs have not yet merged. Enforcement is described as a goal, not a live constraint. A Proposed ADR may lead its implementers honestly because the `Status:` line makes the relationship explicit.
- **`Accepted`**: Both implementing PRs (#317, #318) have merged and the new directory structure is live. The **last implementing PR to land** (#318) flipped `Status: Proposed` to `Status: Accepted` in this file. (The `Superseded by: ADR-0018` header in ADR-0008 was already added in #325.)

Future ADRs that describe a decision ahead of its code should open in `Proposed` state and follow the same lifecycle.
