---
status: accepted
created: 2026-07-01
last-updated: 2026-07-01
---

# ID column mapper naming: host-idiom export names and the generating/non-generating axis

The five ORM adapters (`drizzle.ts`, `kysely.ts`, `mikro-orm.ts`, `prisma.ts`, `typeorm.ts`) each expose an **ID column mapper** — the read/write mapping that carries an `Id<Brand>` across the ORM boundary — in three variants. This ADR records two related naming decisions that govern that surface: (1) adapter export names mirror the **host ORM's own vocabulary** rather than a library-wide canonical name, and (2) the axis distinguishing a caller-supplied mapper from a self-generating one is named **`generating` / `non-generating`**, matching the existing **IdGeneratingCodec** constraint. As a consequence of (2), the misleadingly-named `idFieldReadOnly` export is renamed to `idFieldNonGenerating`.

`CONTRIBUTING.md`'s ADR threshold ("hard to reverse, surprising without context, and the result of a real trade-off") is met on both counts. The naming divergence across adapters reads as an inconsistency to anyone who has not internalized the host-idiom principle — it was in fact misread as one during the audit that prompted this ADR, with the whole codebase in view. And renaming a public export is a breaking change once frozen, so the choice of which name to canonicalize (and which to deprecate) is hard to reverse.

This decision generalizes the host-idiom principle already recorded for the transport layer in [ADR-0020](./0020-adapter-error-types.md) (the `IdParamError` field-name convention: "name the HTTP-status field whatever the target framework's own error-handling pipeline reads natively") from error field names to ORM adapter export names.

## Decision

### Adapter export names mirror the host ORM's vocabulary

Each ORM adapter names its ID column mapper after the primitive its host library already uses, not after a single canonical library-wide noun:

| Adapter | Host-library primitive | Base export |
| --- | --- | --- |
| `drizzle.ts` | `customType` columns | `idColumn` (+ `…Mysql` / `…Sqlite`) |
| `kysely.ts` | `ColumnType`, plugin, insert values | `idColumn` / `idPlugin` / `insertId` |
| `mikro-orm.ts` | `Type` subclass; `onCreate` field option | `idType` / `idField` |
| `typeorm.ts` | `ValueTransformer` (`transformer` option); `@BeforeInsert` | `idTransformer` / `beforeInsertHook` |
| `prisma.ts` | model _fields_; `$extends` result components | `idField` / `idFieldNonGenerating` / `nullableIdField` |

The base-variant names therefore differ across adapters **by design**. A Drizzle user reaches for a `column`, a MikroORM user for a `Type`, a TypeORM user for a `transformer`, a Prisma user for a `field` — each name is the one that reads naturally at that library's call site. Cross-adapter name uniformity is explicitly **not** a goal.

### The provenance axis is `generating` / `non-generating`

An ID column mapper varies along two orthogonal axes:

- **presence** — `non-nullable` (throws on `null` / `undefined`) vs `nullable` (null passthrough), for optional foreign keys.
- **provenance** — `non-generating` (parses and serializes a caller-supplied value; accepts any **IdCodec**) vs `generating` (auto-fills a fresh ID on insert; requires **IdGeneratingCodec**).

`generating` / `non-generating` is the canonical vocabulary for the provenance axis because it already names the codec constraint that gates it (**IdGeneratingCodec**, requiring a synchronous `generate()`). The informal terms "readonly" / "mutable" are retired: they are inaccurate. The non-generating mapper is **not** read-only — it writes to the database on the write path; it merely does not _generate_. Naming it "read-only" invites a reader to expect immutability the type does not have.

### `idFieldReadOnly` → `idFieldNonGenerating`

The Prisma adapter's `idFieldReadOnly` is renamed to `idFieldNonGenerating`. `idFieldReadOnly` is the one export in the entire adapter surface whose name uses the inaccurate "readOnly" word — its return value includes a `write` method. `idFieldReadOnly` is retained as a `@deprecated` alias of `idFieldNonGenerating` until 2.0, so no caller breaks; the change ships as a **minor** version bump (an added export plus a deprecation, both non-breaking).

Only this one export moves. `idField` (the generating variant) is left untouched — its name is unqualified but not _wrong_, and it is shared verbatim with `mikro-orm.ts`, where `idField` also denotes the generating variant.

## Rationale

### Why host-idiom names over uniform names

The mapper is always used at the host library's call site, threaded through that library's own decorators, builders, or extension blocks. A name drawn from the host's vocabulary composes invisibly with the surrounding code (`@PrimaryKey({ type: idType(usr) })`, `pgTable("users", { id: idColumn(usr) })`); a library-imposed canonical name (`idMapper`, say) would read as a foreign object in every one of them. This is the same reasoning ADR-0020 applied to error field names — match the host's shape so the adapter disappears into it — extended from the transport layer to the ORM layer.

### Why `non-generating`, not `readonly`

The provenance axis is about _where the value comes from_, not _whether the column can be written_. Both non-generating and generating mappers write. The only difference is that a generating mapper mints a value when one is absent on insert. `non-generating` states exactly that; `readonly` states something false.

### Why only `idFieldReadOnly` moves (Fork A, not Fork B)

The semantically ideal pairing — `idField` for the plain non-generating mapper and `idFieldGenerated` for the special generating one — is unreachable, for two independent reasons:

1. **A live name cannot be repurposed.** `idField` today requires **IdGeneratingCodec** and returns `defaultQuery`; a deprecated `idField` alias must keep meaning "generating" to preserve existing callers, so `idField` can never come to mean "non-generating." The non-generating variant needs a new identifier regardless.
2. **MikroORM shares the name.** `idField` denotes the generating variant in both `prisma.ts` and `mikro-orm.ts`. Deprecating or repurposing Prisma's `idField` alone desyncs that agreement; keeping it synced means cascading the rename into `mikro-orm.ts` and its docs — a large break for a marginal gain.

So the choice is narrowed to fixing the one genuinely _incorrect_ name (`idFieldReadOnly`) versus additionally chasing symmetry by deprecating the _correct-but-unqualified_ flagship (`idField`). The deprecation budget is spent on the wrong name only.

## Considered Options

- **Uniform cross-adapter names** (e.g. one `idMapper` / `idColumn` everywhere) — rejected. It would read as a foreign object at four of five call sites and contradicts the host-idiom principle already established for the transport layer in ADR-0020.
- **Keep `idFieldReadOnly`** — rejected. "readOnly" describes a capability the export does not have (it writes), and misleads a reader into expecting immutability.
- **Fork B — symmetric rename** (`idFieldGenerated` + `idFieldNonGenerating`, deprecating the flagship `idField`) — rejected. It deprecates a correct name, and to avoid desyncing MikroORM would have to cascade into `mikro-orm.ts`; large blast radius for an aesthetic parity gain.
- **Fork A — rename only `idFieldReadOnly`** (chosen) — fixes the one incorrect name, leaves the correct-but-unqualified `idField` and MikroORM untouched, and accepts the resulting asymmetry as the cost of shipping 1.0 with `idField` = generating.

## Consequences

- **Guidance for future adapter authors.** Name a new ORM adapter's ID column mapper after the host library's own primitive (`column`, `type`, `transformer`, `field`, …), not after a library-wide canonical noun. Use `generating` / `non-generating` and `nullable` for the variant axes.
- **The fourth variant does not exist.** A `generating` + `nullable` mapper is a contradiction — a mapper that self-generates on absence can never yield null. This taxonomy detail lives in the **ID column mapper** glossary entry in `CONTEXT.md`, not in this ADR; it is a description, not a decision.
- **Non-breaking rename.** `idFieldNonGenerating` is added; `idFieldReadOnly` becomes a `@deprecated` alias retained until 2.0. Callers importing the old name continue to work.
- **Implementation deferred.** The `idFieldReadOnly` deprecation, the **ID column mapper** glossary entry, and the adapter documentation parity (the generating-variant sections missing from the Drizzle, Kysely, and TypeORM docs; the README listing) are deferred to a follow-up issue filed after this ADR reaches `main`, mirroring [ADR-0024](./0024-uuid-interop-raw-mapping.md) and [ADR-0025](./0025-frozen-wire-spec-conformance-vectors.md). Until then no code or user-facing doc is changed by this ADR.
