# Prisma `computeField`: carrying `Id<Brand>` through `$extends` without a per-call-site cast

Status: Accepted — implemented by [#509](https://github.com/smonn/ids/pull/509) (Closes #481).

The Prisma adapter's `IdTransform<Brand>` exposes `computeField(fieldName)`, a factory that produces a typed `$extends` result-component field definition. Its purpose is to make an extended-client model field — e.g. `xprisma.user.findUnique(…).id` — type as `Id<Brand>` automatically, without the `as Id<"brand">` cast that every call site previously needed. This ADR records why the factory is shaped the way it is.

The mechanism was flagged during the review of PR #509 (see [discussion_r3476184183](https://github.com/smonn/ids/pull/509#discussion_r3476184183)) as meeting `CONTRIBUTING.md`'s ADR threshold — "hard to reverse, surprising without context, and the result of a real trade-off":

- **Hard to reverse.** `computeField` is a public method on `IdTransform<Brand>`; its shape is now API, and changing it is a breaking change.
- **Surprising without context.** The fix depends on a subtle TypeScript inference rule about contextual typing of function return types. A future contributor reading the implementation would not know why the brand survives without the accompanying explanation.
- **A real trade-off.** Encapsulating a single cast inside the adapter — versus pushing an `as Id<…>` cast to every `$extends` call site — is a deliberate choice with consequences.

The inline comment in `src/adapters/prisma.ts` documents the same reasoning, but it is only visible to someone already reading that file. This ADR makes the decision discoverable from the browsable ADR index.

## Context

Prisma's `$extends` result component is typed through `DynamicResultExtensionArgs`, whose constraint types the `compute` callback as returning `any`:

```ts
compute: (model: …) => any
```

When a `compute` function is written **inline** at the `$extends` call site, TypeScript contextually types it against that `=> any` constraint. The contextual type wins, so the branded `Id<Brand>` return value is widened to `any`, and the brand is lost from the `& R` intersection that `$extends` uses to assemble the extended model type. The result: the extended field types as `string` (or `any`), and every call site needs an explicit `as Id<"brand">` cast to recover the brand.

## Decision

`computeField(fieldName)` returns a **pre-built object literal** whose `compute` property carries an explicit `Id<Brand>` return-type annotation:

```ts
computeField(fieldName: string) {
  return {
    needs: { [fieldName]: true },
    compute: (model: Record<string, unknown>): Id<Brand> =>
      readIdColumn(codec, model[fieldName]),
  };
}
```

The key is that `computeField` is a **function call**, and a function call's return type is **not** subject to contextual typing at the `$extends` call site. TypeScript uses the concrete, already-resolved return type — `{ needs; compute: (…) => Id<Brand> }` — for the `& R` intersection rather than re-checking it against Prisma's `=> any` constraint. The brand therefore propagates to the extended model field automatically, and no per-call-site cast is required.

The single necessary cast is encapsulated inside the adapter (in `readIdColumn` / the codec boundary), not exposed to consumers.

## Rationale

The distinction that makes this work is between an **inline contextually-typed expression** and the **return type of a function call**:

- An inline `compute: (model) => readIdColumn(…)` written directly inside `$extends({ result: … })` is checked against Prisma's `(…) => any` contextual type — the brand is erased before it reaches `& R`.
- The object returned by `computeField(...)` already has a fixed type by the time it appears at the `$extends` call site. Contextual typing does not reach back into a call expression to re-type its result, so the concrete `compute: (…) => Id<Brand>` annotation survives into the intersection.

Moving the object construction behind a function call is therefore not cosmetic — it is the load-bearing part of the fix. Inlining the same object literal at the call site would reintroduce the contextual widening and lose the brand again.

## Considered Options

- **Per-call-site `as Id<"brand">` cast (previous state)** — rejected. It works, but every `$extends` result field that reads an ID needs its own cast, the casts are easy to forget, and a forgotten cast silently degrades the field's type to `string` with no error. The branding guarantee becomes opt-in per call site.
- **A pre-built object returned from `computeField` (chosen)** — the brand is enforced once, in the adapter, and propagates automatically. Consumers write `userIdField.computeField("id")` with no cast and cannot forget one.
- **Casting the whole `$extends` argument** — rejected. Casting the entire `result` argument object is broader and more dangerous than necessary; it would suppress unrelated type errors in sibling fields, not just the `compute` return type.
- **Waiting for Prisma to fix `DynamicResultExtensionArgs`** — rejected as a blocker. The `=> any` typing is upstream and out of our control; consumers need a correctly-typed brand today. If Prisma later types `compute`'s return through a generic, this workaround becomes unnecessary (see Consequences).

## Consequences

- **The brand survives `$extends` with no per-call-site cast.** Extended-client fields built with `computeField` type as `Id<Brand>` automatically. PR #509's test suite includes a `GetPayloadResult + InternalArgs` type-level assertion that proves the brand survives the result-component type path.
- **The single cast is encapsulated.** The one place the raw database value is narrowed to `Id<Brand>` is inside the adapter (`readIdColumn`), not at consumer call sites.
- **The shape is now public API.** `computeField(fieldName)` is part of `IdTransform<Brand>`; its signature is stable surface and changing it is a breaking change.
- **Future Prisma type improvements may make this unnecessary.** If a future Prisma release types `compute`'s return type through a generic instead of `any`, the inline-vs-call-expression workaround would no longer be needed. At that point this ADR's status should move to **Superseded**, with a correction note pointing at the change.
- **Documentation only.** This ADR records a mechanism that shipped in PR #509; it introduces no source, test, or workflow changes.
