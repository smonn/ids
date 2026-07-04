# Full-codebase security audit — 2026-07-04

> **Point-in-time snapshot.** Non-authoritative record of a full-codebase security audit performed on 2026-07-04 at commit `4099780`. Actionable findings have been filed as GitHub issues, which supersede this document; per convention it carries no issue numbers. Severities are the auditor's assessment at audit time.

## Scope and method

Six parallel review passes covered the entire repository: the crypto kernel (`src/codecs/_kernel/` plus every codec `key.ts`), the six codec constructions, the wire layer (`src/wire/`, executed directly to confirm behavior), the CLI (`bin/`, `src/cli/`), all ten framework adapters (`src/adapters/`), and CI/supply chain (all 22 workflows, composite actions, pnpm and hook configuration). Claims were cross-checked against SECURITY.md, SPEC.md, and the ADRs. `pnpm audit` (prod and full) reported no known vulnerabilities.

## Summary

**No critical or high-severity vulnerabilities.** The cryptographic core matches its documented threat model exactly; the CI/supply-chain posture is well ahead of typical practice. Findings cluster at the edges: three medium (one CLI hygiene gap, two adapter-boundary problems), several lows, and documentation/hardening notes.

## Medium findings

### Kysely `idPlugin` collapses table-qualified codec keys

`src/adapters/kysely.ts` (lookup construction; doc claim in the JSDoc above it). Qualified keys like `"users.id"` are stripped to bare `"id"`, last one wins, and the winning codec applies to that column in **every** table. Reads from the losing table throw `IdsError` per row — a silent full-query availability failure on valid data — while the JSDoc promises qualified keys disambiguate. Decision: fail fast at construction on qualified keys; fix the JSDoc.

### Fastify/Express failure hooks can fall through to the handler

`src/adapters/fastify.ts` (`idParam`/`idQuery` failure paths), `src/adapters/express.ts` (hook receives `next`). A Fastify `onError` hook that merely logs returns control without a reply, and the route handler runs with the raw attacker string still in `request.params`, compile-time-branded `Id<Brand>`. Express's hook can call `next()` and run the handler with the ID slot `undefined`. Decision: if the hook did not respond, the adapter sends its default error response (mirroring Hono, whose hook must return a `Response`).

### Signed-codec authenticity is unenforceable at adapter boundaries

`src/adapters/adapter-types.ts` (`IdCodec = { safeParse }`) with the signed codec's structural `safeParse`. No adapter calls the async `verify`, so a forged signed ID with garbage tag bytes passes every adapter as "validated". Decision: opt-in `verify` option on the HTTP adapters (hooks are async); docs-only warning for ORM adapters; document that default validation is structural everywhere.

### CLI accepts raw key material via `--key` on argv with no advisory

`src/cli/key.ts`. argv is visible in `ps`/`/proc/*/cmdline` and shell history; safer channels (`--key-file`, `IDS_KEY`) exist but the key flags are absent from help output entirely. Related lows: `--material` puts digest input (often PII) on argv; `IDS_KEY` carries no hygiene note.

## Low findings

- **Unicode case folding accepts U+212A KELVIN SIGN** — `src/wire/parse.ts`. SPEC mandates ASCII-only folding, but `toLowerCase()` maps U+212A → `k`, so a Kelvin-sign string and its ASCII form alias to the same ID through the lenient path (confirmed by execution; `is()` rejects it). Undocumented alias class and a cross-port divergence on the frozen surface. U+212A is the only single-character Unicode mapping into the alphabet. Companion deviation: overlong inputs are classified `invalid_base32` even when the prefix is also wrong, against SPEC's first-failing-layer rule. Decision: fix code to match SPEC, keep the O(1) length fail-fast, add conformance vectors.
- **CLI `digest match` uses `===`** — `src/cli/verbs.ts`. The only non-constant-time secret-derived comparison in the codebase (the library itself uses `timingSafeEqual` throughout). Largely theoretical through process launch; fix for consistency.
- **`review.yml` hands its prompt-injection-exposed producer step a write-scoped token** — sibling agent workflows mint a read-only `app-token-ro` for the producer. Not exploitable with the current `allowedTools` (no Bash/Edit), but a latent break in the repo's read/write boundary.
- **ORM write path performs no validation** — `src/adapters/adapter-types.ts`. `writeIdColumn` is a passthrough; one `as Id<...>` cast poisons a row that then breaks every read touching it (in Kysely, the whole result set). Decision: validate with `safeParse` on write by default.
- **`columnType` interpolated verbatim into DDL** — Drizzle and MikroORM adapters. Developer-supplied and documented as unvalidated; not attacker-reachable directly. Accepted as-is (an allowlist would break legitimate exotic column types).

## Informational / hardening notes

- Duplicate-brand registry warning is dev-only (`console.warn`, disabled under `NODE_ENV=production`) — per ADR-0007/0021 design; production gets strictly less signal than dev. Accepted.
- Keyring revocation requires constructing a new codec; mutating the original `keys` array does nothing. Docs say "removing an entry revokes" without the rebuild requirement.
- Signed/wrapped HMAC keys are derived with an unused `"verify"` usage; digest is already sign-only.
- `--key-file` is read without a permissions check; CLI "unexpected argument" errors echo the stray token verbatim (a mistyped bare key reaches stderr/CI logs).
- SECURITY.md's `rng` caveat omits that the signed codec also accepts `rng` (impact bounded to same-millisecond collision resistance; tag security unaffected).
- `bench.yml` lacks a top-level `permissions:` block (job-level grants are correct).
- Wrapped-codec ring trial re-trials subsequent keys after a tag-valid-but-malformed-lane result, marginally above the documented `n/2⁶⁴` false-accept bound — theoretical only, unreachable via honest wrap.
- `zeroIv` in the kernel is a shared mutable module-level buffer; module-private today, defensive hardening possible.

## Verified sound

- **Crypto kernel:** HKDF-SHA-256 with distinct domain-separation labels per codec/primitive (ADR-0019/0027); all keys non-extractable; the ADR-0004 AES-CBC strip trick verified algebraically to expose no padding oracle; `timingSafeEqual` branch-free and used for every library tag/digest comparison; no `Math.random`; `fastTenByteRng` provably harvests only fully-random UUIDv4 nibbles and serves only unkeyed codecs.
- **Codec constructions:** fixed-width / length-prefixed HMAC framing with no splice ambiguity; tags bind brand (and kind), blocking cross-brand/cross-kind transplants; timestamp writes reject negative/non-integer/≥2⁴⁸; documented tradeoffs (unauthenticated opaque CBC, 40-/64-bit truncated tags) implemented exactly as documented, never worse.
- **Wire layer (verified by execution):** encode/decode is a bijection on the accepted set over randomized round-trips; the `[048cgmrw]` padding-bit constraint closes canonical aliasing; all regexes linear (no ReDoS); no attacker input echoed in errors; no prototype-pollution surface; UUID mapping round-trips exactly with documented raw-128-bit semantics.
- **Adapters:** all ORM adapters use bound parameters (no SQL injection); GraphQL `parseValue`/`parseLiteral` share one implementation, literal restricted to string kind; no error echoes attacker input; duplicate-query-param smuggling rejected.
- **CI/supply chain:** no `pull_request_target`; 100% SHA-pinned actions; untrusted values reach shells only via `env:` + quoted expansion; agent workflows are label-gated (write access required to trigger) with scoped App tokens and a workflow-file guard; release is push-to-main only with npm provenance and SBOM attestation; pnpm sets `minimumReleaseAge: 1440`, disables lifecycle scripts behind a tight allowlist, and CI's `pnpm audit --prod` is fail-closed; `harden-runner` on privileged jobs.
- **CLI:** keygen uses a CSPRNG with an unconditional secret-handling warning; no key material in error messages; no exec/spawn/eval; no unsafe JSON parsing; fail-fast key resolution before stdin consumption.
