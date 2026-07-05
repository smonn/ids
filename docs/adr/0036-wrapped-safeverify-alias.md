---
status: accepted
created: 2026-07-04
last-updated: 2026-07-04
---

# Wrapped key codec: a `safeVerify` alias so it satisfies the HTTP adapter verify contract

The HTTP adapters (Hono, Express, Fastify, NestJS) accept `verify: true` only when the codec satisfies **IdVerifiableCodec** — a structural interface requiring `safeVerify(input): Promise<{ ok: true; id } | { ok: false; error }>` ([ADR-0012](./0012-signed-timestamp-construction.md), PR #917). The **Signed Timestamp codec** satisfies it; the **Wrapped key codec** does not, because it exposes `safeUnwrap`, not `safeVerify`. This ADR records the decision to close that gap (issue #919) by adding a thin `safeVerify` alias to the Wrapped key codec, rather than by widening the adapter interface.

## Context

Issue #901 specified that each HTTP adapter's `verify` option should reject forged tags "when set with a **signed (or wrapped) codec**." PR #917 implemented only the Signed leg. The Wrapped key codec verifies its tag inside `safeUnwrap`, whose success shape `{ ok: true; id; lookupKey }` is a strict superset of `safeVerify`'s `{ ok: true; id }`, and whose failure shape `{ ok: false; error: ParseError | "verification_failed" }` already fits `IdVerifiableCodec`'s deliberately-loose `error: unknown`. The adapter verify block only ever reads `verifyResult.ok` — it never consumes the returned `id` or `lookupKey`, taking the canonical id from the preceding `safeParse`. **The one and only obstacle is the method _name_: the adapters call `safeVerify`, and the Wrapped key codec has no method by that name.**

## Decision

Add a public `safeVerify(input: unknown)` method to the Wrapped key codec that delegates to `safeUnwrap` and drops `lookupKey` from the success branch:

```ts
safeVerify: async (input) => {
  const result = await codec.safeUnwrap(input);
  return result.ok ? { ok: true, id: result.id } : result;
},
```

Its return type is `{ ok: true; id: Id<Brand> } | { ok: false; error: ParseError | "verification_failed" }` — structurally identical to the Signed Timestamp codec's `SafeVerifyResult`, defined locally in the wrapped codec (no cross-codec import). With this method present, the Wrapped key codec **structurally** satisfies `IdVerifiableCodec`; every HTTP adapter accepts it under `verify: true` with **no change to any adapter and no change to the `IdVerifiableCodec` interface**. A verification failure surfaces as `reason: "malformed"` (default 400) through the exact same channel as the Signed codec's tag failure.

This is a minor-version, additive change: a new public method on `@smonn/ids/wrapped`.

## Considered options

1. **`safeVerify` alias on the Wrapped key codec — chosen.** The change is localized to one codec file (~5 lines plus a type). The adapter layer and `IdVerifiableCodec` are untouched, so the eight duplicated verify blocks (four adapters × `idParam`/`idQuery`) stay byte-for-byte identical and keep working by structural typing — the same mechanism by which `IdCodec` and `IdGeneratingCodec` are satisfied without an explicit `implements`. Cost: `safeVerify` is cryptographically **redundant** with `safeUnwrap` (a wrapped ID cannot be verified without unwrapping it; the alias does the full unwrap and discards the recovered lane), and it adds one method to the codec's public surface.

2. **A parallel `IdUnwrappableCodec` structural interface — rejected.** Adapters would accept a union of the two interfaces and each of the eight verify blocks would branch at runtime on which method exists (`"safeVerify" in codec ? … : …`). This duplicates the adapter overload machinery and pushes codec-specific knowledge into the adapter layer, multiplying the per-adapter complexity where option 1 multiplies it by zero.

3. **Extend `IdVerifiableCodec` to accept `safeVerify` OR `safeUnwrap` — rejected.** A union at the interface level blurs what "verifiable" means (the interface would no longer name a single method), still forces the adapter impl to discriminate at runtime, and broadens a contract whose whole value is its crispness.

Options 2 and 3 keep the Wrapped codec's public API minimal at the price of complicating the adapter layer; option 1 accepts a small, honest addition to the codec's API to keep the adapter layer trivial. Given the verify block is duplicated eight times, we chose to pay the cost once in the codec rather than eight times in the adapters.

## Consequences

- **`safeVerify` and `safeUnwrap` are deliberately overlapping.** `safeVerify` answers "is this ID authentic under my keyring?"; `safeUnwrap` answers "authentic — _and what lookup key does it carry?_". A caller who needs the lane must use `safeUnwrap`; `safeVerify` exists for the verify-only surface (the HTTP adapters, and callers who want to gate on authenticity without surfacing the internal integer). The redundancy is intentional, not an oversight — this ADR is the record of _why_ the codec carries both.
- **Removing `safeVerify` later is a breaking change**, as with any public method.
- **CONTEXT.md** is updated: the `IdVerifiableCodec` entry now lists both the Signed Timestamp codec and the Wrapped key codec as satisfying it, and the Wrapped key codec entry gains `safeVerify`.
- **HTTP adapter docs** (Hono, Express, Fastify, NestJS) drop the Wrapped key codec from their "non-verifiable codec" list and note that `verify: true` now works with both the Signed Timestamp codec and the Wrapped key codec.
- **Out of scope, unchanged:** the ORM adapters (verification is not an ORM-boundary concern), the GraphQL adapter (its synchronous `parseValue`/`parseLiteral` cannot await verification), and the `wrapped inspect` CLI (no readable payload to report on failure — see CONTEXT.md's `signed inspect` verification-contract note).
