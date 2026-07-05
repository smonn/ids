---
status: accepted
created: 2026-06-26
last-updated: 2026-06-26
---

# Conformance vector file schema: orthogonal category × operation, return-typed expectations, portable rejection layers

[ADR-0025](./0025-frozen-wire-spec-conformance-vectors.md) accepted `spec/vectors.json` — an append-only, `toEqual`-asserted oracle, v1 scoped to the shared wire layer plus the Timestamp and Reverse Timestamp codecs and the Raw UUID mapping — but left the concrete file schema to the implementation issue (#625). This ADR records the schema chosen there. The file is `{ "version": <int>, "vectors": [...] }`; each vector is `{ name, description?, category, operation, input, expected }`.

## Decision: orthogonal `category` × `operation`, not pre-qualified operation names

ADR-0025 illustrated operations as `canonicalize / uuid / timestamp.extract / …`, which bakes the codec into the operation name and then duplicates it in a separate tag. We normalize to two orthogonal axes: a `category` (a codec variant, or the shared wire layer) and a bare `operation` verb. `extract` is one concept that exists on multiple codecs — `reverse.extract` is not a distinct operation, it is `extract` on the `reverse` category — so the codec belongs on its own axis. The `(category, operation)` pair is the unique identity and the key the completeness guard iterates.

Operation names are **snake_case** (`extract`, `generate`, `canonicalize`, `to_uuid`, `from_uuid`) to match every other machine-readable string identifier this project freezes — the `ParseError` reasons (`not_string`, `invalid_base32`) and the eleven `IdsErrorCode` values (`verification_failed`, `invalid_id`). Kebab-case would make this the lone file diverging from that convention.

## Decision: the axis is `category` (`codec:<variant>` | `wire`), not `codec` — and not `kind`

The value space is the six codecs plus the shared wire layer. `wire` is **not** a codec — ADR-0025's own scope text separates "the shared wire layer" from "the codecs" — so naming the field `codec` would be a permanent fib for every shared-layer vector (`canonicalize`, `to_uuid`, `from_uuid`). The field is named `category`, and its values are namespaced: `codec:timestamp`, `codec:reverse` for the codecs, bare `wire` for the shared layer. The `codec:` prefix keeps the explicit "this is a **Codec variant**" signal that a flat `category` would lose, while `wire` stands on its own honestly. The `:` is purely a namespace separator (distinct from snake_case word-separation); no codec name is multi-word, so the two conventions never collide.

`kind` was rejected as the field name even though the namespaced-value idea is good: `kind` is already the **Wrapped key** codec's lane-type term (`u32` / `i32` / `u64` / `i64`), with an `invalid_kind` error code and a `WrappedKind` type. In v2 the wrapped-key vectors will carry a real `kind` field (`{ "category": "codec:wrapped", "kind": "u64", … }`); reusing `kind` for the category axis would be a literal duplicate-key collision.

## Decision: `expected` mirrors the operation's return type; outcomes via a ParseResult-shaped union

Each vector states "applying `operation` to `input` yields `expected`," and `expected`'s shape tracks the operation's actual return type — exactly as `input`'s shape tracks its parameter type.

- **Total operations** (`extract`, `generate`, `to_uuid`) take trusted input and cannot fail. Their `expected` is the bare value (an ms integer, an id string, a UUID string); they have no negative vectors.
- **Boundary operations** (`canonicalize`, `from_uuid`) wrap `safeParse` / `safeFromUUID` and either accept or reject. Their `expected` mirrors the library's **ParseResult**: `{ "ok": true, "id": <canonical> }` or `{ "ok": false, "layer": <layer> }`. The `ok` boolean is the positive/negative discriminator — not an invented field, but the serialized form of what those functions actually return.

This is why we did not add a top-level `valid` flag or uniformly wrap every `expected` in `{ ok }`: that would put an always-true field on the total operations, where a bare value is the honest serialization of a function that cannot fail.

## Decision: negatives carry the portable rejection `layer`, not the reference-impl reason string

SPEC.md froze the rejection **layer** (`prefix` / `base32` / `uuid` / `not_a_string`) as the portable contract and declared the `ParseError` reason _strings_ (`invalid_base32`, …) informative and not frozen. To keep `spec/vectors.json` consistent with the SPEC.md half of the same contract, a negative vector's `layer` field carries the portable layer, and the harness maps the implementation's reason string → layer before comparing. Baking the reason string into the frozen file would freeze exactly what SPEC.md says is not frozen, and would couple cross-language porters to TypeScript's reason vocabulary. The field is named `layer` (not `error`) so no reader mistakes it for a verbatim `ParseResult.error`.

## Decision: uniform `{ input, expected }`, hex bytes, integer-ms timestamps, named vectors

`input` is a scalar for single-input operations (an id or UUID string) or a small object for multi-input operations (`generate`: `{ "timestamp": <ms>, "rng": <hex> }`). Raw bytes are **lowercase hex** (the project's existing raw-key-material convention; the Crockford alphabet is reserved for payloads). Timestamps are **integer milliseconds** since the Unix epoch — what `extractTimestamp` yields, fitting safely in a JSON number, with no ISO formatting/parsing dependency.

Each vector has a required, unique, snake_case `name` and an optional `description`. The name is the stable handle for the one change ADR-0025 permits to a frozen vector — an **erratum** — and makes a failing assertion actionable (`FAILED: to_uuid_running_example`) where an array index is not; `(category, operation)` does not uniquely identify because several vectors share it. `description` carries the rationale for non-obvious cases (negatives, edge cases) so a porter need not cross-reference SPEC.md.

Two fields were deliberately left out of v1: a per-vector `since` version (git tags already give per-version byte-stability — the same reasoning ADR-0025 used to reject versioned filenames — so a flat list never needs a version column) and a `$schema` self-description (additive later; a `spec/vectors.schema.json` is a clean follow-up if a porter wants machine validation).

## Decision: v1 vectors are authored against the brand `usr`

`canonicalize` and `from_uuid` are brand-scoped in the implementation (the parser takes a prefix). Rather than carry a per-vector `brand` field, the harness fixes the brand to `usr` — the running-example brand, visible in every id string. Reject-only vectors (which have no expected id) are parsed against that same fixed brand, which is what makes `canonicalize_reject_wrong_prefix` (an `org_…` input rejected at the prefix layer) well-defined. A per-vector brand field is unnecessary because the brand is always readable from the id strings; it stays additive if a future version ever needs to vector multiple brands at once.

## Considered options

- **Pre-qualified operation names (`timestamp.extract`)** — rejected: duplicates the codec axis into the operation string and carries the codec twice in the completeness-guard key. ADR-0025's dotted form was illustrative, not a prescriptive schema.
- **Field named `codec`** — rejected: `wire` is not a codec, so it fibs for every shared-layer vector. **Field named `kind`** — rejected: collides with the Wrapped key lane-type term, which v2 vectors will carry as a real field.
- **Top-level `valid` boolean / uniformly wrapping every `expected` in `{ ok }`** — rejected: redundant always-true field on the total operations; a return-typed `expected` is the honest serialization.
- **Reason string in the negative branch** — rejected: freezes the TypeScript reason vocabulary that SPEC.md explicitly leaves informative, making the two halves of the contract disagree about the frozen surface.
- **Per-vector `since` / a `$schema` pointer** — deferred: git tags already give per-version stability; both are additive later.
- **Per-vector `brand` field** — rejected for v1: the brand is visible in every id string and a fixed harness brand suffices; additive if ever needed.

## Consequences

- New artifacts: `spec/vectors.json` (`version: 1`, twelve vectors over the seven in-scope `(category, operation)` pairs) and `spec/vectors.test.ts`, which asserts each vector with `toEqual`, maps `ParseError` reason → `layer` for boundary negatives, and adds completeness, name-uniqueness, and in-scope guards. `spec/vectors.json` (only — not the test) is added to `package.json` `files`.
- The harness lives at `spec/vectors.test.ts`, co-located with the data and outside `src/`, so it is exempt from the codec-layering `depcruise` rules; it loads the JSON via `fs` (no `resolveJsonModule`).
- `CONTEXT.md`'s **Conformance vector** entry is updated to the `category` vocabulary.
- v2 extends additively: keyed codecs join as `codec:opaque` / `codec:signed` / `codec:wrapped` / `codec:digest`, the wrapped vectors carrying their own `kind` field (now free), and the `category` / `layer` value vocabularies grow without changing any existing vector.
