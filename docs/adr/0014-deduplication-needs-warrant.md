# Shared modules need warrant: de-duplicate only at >2 call sites or substantial shared code

Repetition alone does not justify a shared module. Every abstraction carries standing costs: a new interface that each caller — and each future reader — must learn, a layer of indirection between the call site and the behaviour, and the risk of a **shallow module** whose interface is nearly as wide as its implementation. The design vocabulary's "two adapters = a real seam" tells you a seam _exists_; it does not tell you the seam carries enough behaviour to be worth crossing. We therefore require de-duplication to clear a value bar before it earns a module.

**Decision.** Extract a shared (de-duplication) module only when at least one of these holds:

- **>2 call sites** (three or more) share the logic; or
- the shared logic is **substantial per site** — not a one- or two-line wrapper — so consolidating concentrates real behaviour rather than boilerplate.

At exactly two thin call sites, prefer leaving the duplication in place, _especially_ when the abstraction would press against an existing layering decision. Re-evaluate when a third case appears or the shared body grows.

This is engineering judgment, not a hard gate — "substantial" is deliberately qualitative. The point is to shift the default from "de-duplicate on sight" to "de-duplicate when it pays."

**Motivating case.** The `timestamp` and `reverse` codec constructors are near-identical: their return objects differ only in the layout binder and the default `rng`. That is two structurally-identical call sites, but every duplicated line is a one- or two-line wrapper, and the public codec types still need their own documentation regardless. A shared assembler's learning-plus-indirection cost roughly equals its savings — and a "fold every variant together" assembler would re-create the **uniform internal `VariantMethods` interface that [ADR-0008](./0008-internal-module-layering.md) explicitly rejected**. So it stays unconsolidated until a third structurally-identical readable-timestamp variant exists. (`signed` does not count — it diverges materially: async `generate`, `verify`/`safeVerify`, a mandatory signing keyring, and a different `exampleWireId`.)

> **Correction (2026-06-24):** [ADR-0018](./0018-by-feature-codec-slices.md) superseded ADR-0008 as the governing authority for the internal layer model.

## Considered options

- **Value threshold (>2 call sites OR substantial shared code) — ACCEPTED.** Pairs the deletion test ("does deleting this concentrate complexity, or just move it?") with a second filter ("is there enough of it to be worth an interface?"). Keeps abstractions deep and stops thin dedup helpers from accreting.

- **DRY-always / extract on the second occurrence — REJECTED.** Rewards shallow modules. At two thin call sites the abstraction's learning and indirection cost ≈ its savings, and the new module can re-introduce shapes prior ADRs deliberately rejected (the `VariantMethods` case above). "Duplicated" becomes a sufficient reason, when it should only be a necessary one.

- **Never de-duplicate / always inline — REJECTED.** At three or more call sites, or with a substantial shared body, duplication genuinely costs locality (a fix must land in N places, and they drift) and navigability (readers must diff files to discover sameness). The bar is value, not a blanket prohibition.

## Consequences

- **Architecture reviews apply this bar before proposing a de-duplication.** The `/improve-codebase-architecture` command (and any refactor) must treat "duplicated" as necessary but not sufficient: pass the deletion test first, then clear this threshold. A candidate that fails the threshold is recorded, not re-surfaced each pass.
- **No shared timestamp-family constructor assembler** while only `timestamp` and `reverse` qualify. Revisit at a third structurally-identical readable-timestamp variant (same sync surface, same `exampleWireId(ms)` shape). `signed` stays its own constructor.
- **Cites, does not reopen, [ADR-0008](./0008-internal-module-layering.md).** ADR-0008 governs the internal `wire/` + `layouts/` rings and rejected one uniform variant interface; this ADR generalises the "is the abstraction worth it?" judgment that the rejection was a specific instance of.

  > **Correction (2026-06-24):** [ADR-0018](./0018-by-feature-codec-slices.md) superseded ADR-0008. The `layouts/` ring is retired; codecs now live under `src/codecs/<name>/` with their layout ops in `src/codecs/<name>/layout.ts`. The `VariantMethods`-rejection reasoning remains intact under the new structure.

- **No code, wire, or `CONTEXT.md` change.** This records a standing engineering-judgment decision; it ships nothing.
