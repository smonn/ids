# Parameter-intersection over generic-constraint for `ValidBrand<Brand>` enforcement

[ADR-0001](./0001-brand-format.md) establishes the brand format — exactly three lowercase `a–z` characters. That constraint is enforced at runtime by `validateBrand()`, but compile-time enforcement requires a TypeScript type that rejects invalid brand literals at the call site. Issue [#550](https://github.com/smonn/ids/issues/550) exposed that the first attempt (PR #525), which applied the constraint via a generic-constraint form, crashed `tsc` with `RangeError: Map maximum size exceeded`. PR [#554](https://github.com/smonn/ids/pulls/554) shipped the replacement: a **parameter-intersection** form that gives equivalent compile-time guarantees without exhausting the TypeScript type-checker's internal cache.

`CONTRIBUTING.md`'s ADR threshold — "hard to reverse, surprising without context, and the result of a real trade-off" — is met: the fix is a single word swap (`extends` → `&` in the parameter position), the reason is a TypeScript internals quirk that is invisible from the source, and a future contributor who reasonably rewrites `brand: Brand & ValidBrand<Brand>` back to `Brand extends ValidBrand<Brand>` would reproduce the crash without any local signal that explains why it was wrong.

This ADR covers only the _enforcement mechanism_. The brand format itself — three lowercase `a–z` chars, `26³ = 17 576` combinations — is fixed by ADR-0001 and is not reopened here.

## The two approaches

`ValidBrand<S extends string>` is a validator-style conditional type:

```ts
export type ValidBrand<S extends string> = string extends S
  ? S
  : S extends `${LowerChar}${LowerChar}${LowerChar}`
    ? S
    : never;
```

It resolves to `S` when `S` is exactly three lowercase `a–z` characters, to `never` when it is not, and to the wide `string` type when `S` is the unresolved generic `string` (the short-circuit that keeps dynamic-brand call sites working).

**Generic-constraint form (PR #525 — failed):**

```ts
function createTimestampId<Brand extends ValidBrand<Brand>>(brand: Brand, ...): TimestampCodec<Brand>
```

**Parameter-intersection form (PR #554 — chosen):**

```ts
function createTimestampId<Brand extends string>(brand: Brand & ValidBrand<Brand>, ...): TimestampCodec<Brand>
```

In both cases the goal is identical: reject `createTimestampId("user")` (four chars) and accept `createTimestampId("usr")`. The critical difference is _when and how_ TypeScript evaluates `ValidBrand<Brand>`.

## Why the generic-constraint form is unviable

When TypeScript processes a function with `<Brand extends ValidBrand<Brand>>`, it must verify at every call site that the inferred `Brand` satisfies the constraint. Satisfying `Brand extends ValidBrand<Brand>` requires TypeScript to evaluate the conditional type `ValidBrand<Brand>` in an unresolved context — in practice, this means traversing the full population of valid brands: the `26³ = 17 576`-member template-literal union `` `${LowerChar}${LowerChar}${LowerChar}` ``. TypeScript's internal type-relationship checker stores deferred type-relationship pairs in a `Map` that has a fixed maximum capacity. At 17 576 members, the map fills and the type-checker throws:

```
RangeError: Map maximum size exceeded
```

This is not a configuration error or a resource limit that can be raised — it is a hard bound in the TypeScript compiler itself. No amount of `tsconfig.json` tuning removes it. The crash was confirmed in issue [#550](https://github.com/smonn/ids/issues/550) and on PR #525.

## Why the parameter-intersection form works

In `brand: Brand & ValidBrand<Brand>`, the type parameter constraint remains the wide `Brand extends string`. TypeScript never checks the 17 576-member space as a constraint.

At a concrete call site — `createTimestampId("usr")` — TypeScript infers `Brand = "usr"` from the argument, then resolves `ValidBrand<"usr">` distributively: the conditional type evaluates one branch, confirms `"usr"` matches `` `${LowerChar}${LowerChar}${LowerChar}` ``, and produces `"usr"`. The intersection `"usr" & "usr"` is `"usr"`, so the argument is accepted. For `createTimestampId("user")`, `ValidBrand<"user">` evaluates to `never`, the intersection `"user" & never` is `never`, and the compiler reports a type error at the call site. The full 17 576-member union is never constructed.

At a dynamic call site where the brand is a `string` variable — such as the CLI's codec factory or an ORM adapter — `string extends string` triggers the short-circuit branch and `ValidBrand<string>` evaluates to `string`. The intersection `string & string` is `string`, so no constraint is imposed and no existing dynamic-brand code breaks.

## Considered options

- **Parameter-intersection: `brand: Brand & ValidBrand<Brand>` where `Brand extends string` (CHOSEN).** Lazy evaluation of the conditional type per call site avoids union materialisation. Dynamic-brand call sites are unaffected because `ValidBrand<string>` short-circuits to `string`. No semantic change for callers who pass valid brand literals: the inferred type is unchanged, the codec return type is unchanged, and the error message ("Argument of type '…' is not assignable to parameter of type 'never'") appears at the call site exactly as intended.

- **Generic-constraint: `<Brand extends ValidBrand<Brand>>(brand: Brand, ...)` — REJECTED.** Equivalent intent but causes `RangeError: Map maximum size exceeded` in `tsc` at the 17 576-member union scale imposed by ADR-0001's three-lowercase-letter brand format. Confirmed to crash in issue [#550](https://github.com/smonn/ids/issues/550).

- **Keep the union type (`ValidBrand = ${LowerChar}${LowerChar}${LowerChar}`) with `Brand extends ValidBrand` — REJECTED.** The explicit-union form is the direct cause of the crash: TypeScript exhausts its internal type-relationship map when evaluating the 17 576-member union as a constraint bound. The conditional-type form with parameter-intersection avoids this at negligible diagnostic cost — the error message is marginally less descriptive but points to the correct call site.

- **No compile-time enforcement — REJECTED.** Runtime `validateBrand()` catches invalid brands, but only when the codec is constructed. A compile-time guard surfaces the mistake immediately in the editor and in CI type-checking, without requiring a test to exercise the constructor path.

## Consequences

- All six codec constructors use `brand: Brand & ValidBrand<Brand>` with `Brand extends string`. The constraint is applied uniformly; a future codec variant author should follow the same pattern.
- `ValidBrand<S>` is a public export from the main entry point. **Downstream consumers who want to apply brand validation in their own type-level code should use the parameter-intersection form, not the generic-constraint form.** Concretely: write `(brand: Brand & ValidBrand<Brand>)` in any function that accepts a codec brand, not `<Brand extends ValidBrand<Brand>>(brand: Brand)`. The parameter-intersection form is safe regardless of the TypeScript version; the generic-constraint form may work on future TypeScript releases with a larger internal cache, but it is fragile and not contractually guaranteed.
- This ADR does not reopen ADR-0001 (brand format, character set, width). The 17 576-member space is a fixed consequence of that closed decision; this ADR documents how to operate within it without crashing the type-checker.
