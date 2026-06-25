# The brand registry stays process-global, warn-only, and production-disabled; a test reset hook relieves the only real cost

The shared brand registry in `src/codecs/_kernel/registry.ts` is a **process-global** `Set<string>`: every codec constructor calls `registerBrand(brand, opts.allowDuplicateBrand)` as its second line, and a second registration of the same brand in a non-production Node process emits a one-time `console.warn`. Issue [#546](https://github.com/smonn/ids/issues/546) (split off from [#492](https://github.com/smonn/ids/issues/492)) asks whether a process-global is the right model, or whether brand-duplicate detection should move to an injectable / per-registry boundary. This ADR records the decision to **keep the process-global model**, documents why so it stops being flagged as a nit, and adds one small affordance — an internal `resetBrandRegistry()` — for the single friction that is genuinely worth fixing.

`CONTRIBUTING.md`'s ADR threshold ("hard to reverse, surprising without context, and the result of a real trade-off") is met: the model is cross-referenced by [ADR-0007](./0007-wire-indistinguishable-codec-variants.md) (which introduced the registry as the one-codec-per-brand guard) and [ADR-0013](./0013-opaque-key-rotation.md) (whose key-rotation pattern deliberately relies on the `allowDuplicateBrand: true` opt-out), so a future reader needs the trade-off recorded rather than re-litigated.

## What the registry actually is

Three properties reframe the "shared mutable process state" concern that the issue raises:

1. **It only warns — it never throws.** Construction always succeeds. The registry is a development-time _advisory_, not an enforcement boundary. Nothing about program behavior changes whether a brand is registered once, twice, or not at all.
2. **It fully no-ops in production** (`process.env.NODE_ENV === "production"`) and in any non-Node runtime (`typeof process === "undefined"`). It therefore has **zero effect** in exactly the multi-tenant / multi-instance production deployments the "shared mutable state" objection is worried about.
3. **It is internal.** It lives under `_kernel` ([ADR-0008](./0008-internal-module-layering.md)), is not re-exported from `src/index.ts`, and is not a `package.json` export. It is not part of the public API surface and carries no stability contract.

In short: the registry is a lint-grade heuristic that fires only in a developer's dev/test loop. It is not load-bearing for correctness, because it cannot be — it has no runtime effect beyond a console message.

## Decision

**Keep the process-global, warn-only, production-disabled registry.** The `allowDuplicateBrand?: boolean` opt-out on each codec's options retains its current meaning: "I am knowingly constructing this brand more than once; suppress the dev warning."

**Add an internal `resetBrandRegistry()`** to `registry.ts` that clears the registered-brand and already-warned sets. It is for test setup only: it is not re-exported from `src/index.ts` and is not a public export. This removes the one concrete cost of the global — cross-test contamination within a single test process — without changing the model.

No reconciliation with ADR-0013 is required: the rotation pattern's `Map<epoch, OpaqueTimestampCodec>` continues to pass `allowDuplicateBrand: true` on its non-current instances, and that flag's meaning is unchanged.

## Failure modes the global prevents, and the friction it creates

Per the issue's first scope item, enumerated honestly given that the registry is warn-only and production-disabled.

**What it catches (dev-loop smells, at near-zero wiring cost):**

- The same brand registered under **two different codecs** — e.g. `createTimestampId("usr")` followed by `createOpaqueTimestampId("usr")`. This is the [ADR-0007](./0007-wire-indistinguishable-codec-variants.md) scenario: because codec variants are wire-indistinguishable, decoding a `usr_…` ID with the wrong codec yields silent garbage, so an early dev-time warning is the only practical guard.
- **Double-bundling / duplicate-import** bugs, where two copies of a module each register the same brand.
- Accidental repeat construction of a brand that should be a module-init singleton.

It does **not** prevent any runtime correctness fault — it neither throws nor alters behavior, and it is off in production.

**The friction it creates:**

- **Test isolation.** The module-global `Set` persists for the lifetime of a test process. Before this ADR, tests paid for that two ways at once: scattering `allowDuplicateBrand: true` through suites that construct codecs repeatedly (every transport/ORM adapter test, the CLI tests), and minting unique throwaway brands (`zba`, `zbb`, `zbc`, …) to dodge cross-test contamination. `resetBrandRegistry()` lets a suite reset state in `beforeEach` and use stable, readable brands instead.
- **Rotation must remember the flag.** ADR-0013's caller-held `Map<epoch, OpaqueTimestampCodec>` trips the warning unless every non-current instance passes `allowDuplicateBrand: true`. This is documented in the **Key epoch** entry of `CONTEXT.md` and is accepted as the cost of the forward-only rotation model.
- **CLI repeat-construction.** The CLI constructs codecs per invocation and passes `allowDuplicateBrand: true` in `cli/codec-options.ts` and `cli/variants.ts` for the same reason.

## Considered Options

- **Keep the process-global + document + add a test reset hook (CHOSEN).** The "shared mutable process state" objection is largely neutralized once you observe the function is warn-only and production-disabled — it does not leak into multi-tenant production and cannot affect correctness. The only real residual cost is test contamination, which a three-line internal reset hook removes. Lowest cost, preserves the "one codec per brand, built at module init" mental model that ADR-0007 sells, and needs no ADR-0013 reconciliation.

- **Per-registry / injectable detection — REJECTED.** Thread a registry instance (or a `createRegistry()` factory) through every codec constructor and every adapter / CLI callsite. This would give true per-instance isolation, but it adds a wiring parameter across all six constructors and every caller for a feature that has **no production effect** and exists purely as a dev nicety. It also complicates the module-init-singleton mental model and would force edits to ADR-0007 and ADR-0013. The cost/benefit does not justify it: it pays a real, permanent API and wiring cost to harden a heuristic that never runs in production.

- **Make duplicate detection opt-in (invert the default) — REJECTED.** Default the check off; require callers to opt _in_. This would erase the flag noise in tests and rotation, but a safety hint that nobody enables provides almost no value — and the most dangerous case (the same brand under two wire-indistinguishable codecs) is precisely the one where the author does not know to opt in. This guts the purpose of the warning to save a flag.

## Consequences

- **No model change, no wire change, no public-API change.** Codec construction behaves exactly as before; `allowDuplicateBrand` keeps its meaning.
- **`resetBrandRegistry()` is internal and test-only.** It is exported from `_kernel/registry.ts` for test setup but is not surfaced on `src/index.ts` or any subpath export, so it adds nothing to the published surface ([ADR-0008](./0008-internal-module-layering.md)).
- **ADR-0007 and ADR-0013 stand unchanged.** This ADR records the rationale they assumed but never spelled out; it does not revise either. The rotation pattern still relies on `allowDuplicateBrand: true`, by design.
- **Tests can use stable brands.** Suites that previously minted throwaway brands or sprinkled `allowDuplicateBrand: true` to survive the global may now reset the registry between cases. Migrating existing suites is optional cleanup, not required by this decision.
- **Does not reopen closed decisions.** The decision depends on the wire-indistinguishability of codec variants ([ADR-0007](./0007-wire-indistinguishable-codec-variants.md)) being the reason the warning has value at all; it does not revisit that.
