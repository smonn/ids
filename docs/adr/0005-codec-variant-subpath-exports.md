# Codec variants ship as subpath exports

Codec variants beyond the Timestamp codec (Opaque, and future Signed Timestamp / Digest / Reverse Timestamp) introduce algorithm code, key types, or async APIs that the dominant codec doesn't need. Each variant ships as a subpath export (`@smonn/ids/opaque`, `@smonn/ids/signed`, etc.) rather than being re-exported from the main entry. The main entry remains sync-only and free of variant-specific types and algorithm code, preserving the package's "small, fast, sync" identity for the common case.

## Considered Options

- **Re-export from main entry** — rejected: pollutes the main entry's type surface with `Promise<Id>` and variant-specific options; drags algorithm code into bundles that don't use the variant.
- **Sibling packages** (e.g. `@smonn/ids-opaque`) — rejected: see [docs/IDEAS.md](../IDEAS.md); variants share `Id<Brand>`, the parse path, and the brand registry, so cross-package coupling would be awkward.
- **Single file, single entry** — rejected: no isolation; same drawbacks as re-export.

## Consequences

- Shared types (`Id<Brand>`, parse types, the brand registry) stay in the main entry and are imported by each variant subpath.
- Adding a new codec variant means a new entry in `package.json#exports`, `tsdown.config.ts`, and a new `src/<variant>.ts` — no churn to existing variants.
- Discoverability cost: `createOpaqueTimestampId` is not surfaced by autocomplete on `@smonn/ids`. README and JSDoc on `createTimestampId` cover the pointer.
- Establishes the precedent for adapter integrations too (see [docs/IDEAS.md](../IDEAS.md)).
