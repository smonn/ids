---
status: accepted
created: 2026-06-26
last-updated: 2026-06-26
---

# Frozen wire spec: a descriptive, normative-ready `SPEC.md` plus an append-only conformance-vector file

Publish a `SPEC.md` that documents the wire format and a machine-readable `spec/vectors.json` of conformance vectors that CI asserts the reference implementation against. The goal is twofold: lock the now-settled format against our own future drift (a CI oracle), and give cross-language porters a precise, test-vector-backed description to build to — the "frozen wire spec + cross-language conformance vectors" sketch in [docs/IDEAS.md](../IDEAS.md), the lowest-risk of the TypeID-parity gaps now that width ([ADR-0015](./0015-twenty-byte-payload-wide-block-prp.md)) and the UUID mapping ([ADR-0024](./0024-uuid-interop-raw-mapping.md)) are settled.

This is a design-acceptance gate. Implementation — the `SPEC.md` prose, the `spec/vectors.json` file and its test harness, the `CODEOWNERS` entry, the agent-workflow prompt guards, and the triage classification rule — is deferred to follow-up issues filed after this ADR reaches `main`, mirroring [ADR-0024](./0024-uuid-interop-raw-mapping.md).

## Why now, and not blocked on UUID interop

The two things a frozen spec must pin are both already decided. The 128-bit format is permanent ([ADR-0015](./0015-twenty-byte-payload-wide-block-prp.md)); the per-codec constructions are pinned in prose ([ADR-0003](./0003-canonical-strict-is.md), [ADR-0004](./0004-aes-cbc-strip-trick.md), [ADR-0010](./0010-reverse-timestamp-inversion.md), [ADR-0012](./0012-signed-timestamp-construction.md), [ADR-0017](./0017-digest-codec-construction.md)); and the UUID mapping is a settled, deterministic bijection ([ADR-0024](./0024-uuid-interop-raw-mapping.md)). The spec depends only on the wire-level mapping, which has landed. The UUID interop work still deferred by ADR-0024 (CLI, ORM native-`uuid` storage, wider `fromUUID` leniency) is all downstream or strictly additive and non-breaking — none of it can invalidate a vector written now. The only sequencing nicety is to author against shipped, test-covered behaviour rather than a moving branch.

## Decision: descriptive now, normative-ready

`SPEC.md` describes the reference implementation. It does **not** yet offer a conformance claim others may make. The vectors run in our CI as a drift-lock and double as a porting aid used at the porter's own risk.

A normative spec — third parties may claim "conformance," we commit to a stable conformance suite and a promise the constructions never change — is rejected **for now**, not on its merits but on the project's standing rule: no public commitment without a concrete consumer. The recently rejected codec variants ([docs/IDEAS.md](../IDEAS.md), 2026-06-25) fell to exactly this bar, "no open issue requested either." No third-party porter is on file. Going normative now would also be the worst moment to do it, because it would force the keyed-codec test-key publication and freeze the AES/HMAC constructions before anyone needs them frozen.

The format is already frozen by ADR, so "descriptive" here does not mean "unstable" — it means the stability is the ADRs' existing guarantee, not a new conformance contract. Elevation to normative is an additive status change in `SPEC.md`, not a rewrite, the day a porter appears.

## Decision: v1 freezes the wire layer plus Timestamp/Reverse plus the UUID mapping

The v1 vector set covers:

- the **shared wire layer** — prefix rules, base32 canonicalization and padding-bit rejection ([ADR-0003](./0003-canonical-strict-is.md)), the 16-byte payload, and the **Raw UUID mapping** ([ADR-0024](./0024-uuid-interop-raw-mapping.md));
- the two **plaintext codecs** — Timestamp (`extractTimestamp`, `generateAt` under fixed `rng`) and Reverse Timestamp (the inversion, [ADR-0010](./0010-reverse-timestamp-inversion.md)).

This rests on a distinction worth stating: the **wire shape** is codec-independent — every codec is wire-indistinguishable by construction ([ADR-0007](./0007-wire-indistinguishable-codec-variants.md)) — so one set of shared-layer vectors freezes the wire for _all six_ codecs at once, with no keys and no RNG. What the keyed codecs add is **construction** conformance (how each fills the 16 bytes), which is a different property from wire conformance and the only part v1 omits.

The keyed codecs (Opaque, Signed, Wrapped, Digest) are therefore deferred to an additive v2 vector-version bump. They are the unlikely port target (TypeID parity is the plaintext, keyless surface), and vectoring them forces the test-key decision below. Deferring them keeps v1 keyless and zero-machinery while still fully freezing the wire, and the v2 bump conveniently exercises the append-only versioning mechanism for real.

**Keyed-codec test keys (deferred to v2):** when keyed construction vectors are added, the fixed test keys live in-repo as published fixtures expressed via `encodeOpaqueKey` / `decodeOpaqueKey`. Under a descriptive spec a test key is a fixture, not a secret. Recorded here as the v2 default, not settled in this ADR.

## Decision: independent, append-only vector versioning

The wire format carries no version — [ADR-0007](./0007-wire-indistinguishable-codec-variants.md) rejected a payload version byte and [ADR-0015](./0015-twenty-byte-payload-wide-block-prp.md) settled the width permanently — so there is no format-version number that ever increments. The vector _file_ does grow (v2 adds the keyed codecs; later additions add cases). Coupling the two would invent a format-version concept the wire deliberately lacks.

So they are independent. `spec/vectors.json` carries its own monotonic `version` field, and that version is **append-only**: a new version only ever _adds_ codecs or cases. An existing vector's expected output never changes, because that would be a wire break, which is out of scope ([ADR-0015](./0015-twenty-byte-payload-wide-block-prp.md)). The sole exception is an **erratum** — a vector transcribed wrong, corrected to the output the frozen format always required.

## Decision: root `SPEC.md`, single append-only `spec/vectors.json`

`SPEC.md` lives at the repo root, alongside `README` / `SECURITY` / `CONTRIBUTING`, where a porter expects a contract. The vectors live at `spec/vectors.json` — a dedicated top-level `spec/` directory marks the artifact as a contract and keeps it distinct from `docs/` prose; putting it under `test/` would brand it an internal fixture and undercut the porting story.

It is a single file (not per-version filenames): a single growing file is what most projects ship, the append-only guarantee means old cases never change, and per-version byte-stability is already free via git tags / the npm package version — versioned filenames would only duplicate every prior case into each new file. Each case is tagged with its codec and operation (`canonicalize` / `uuid` / `timestamp.extract` / …). `spec/vectors.json` is added to `package.json` `files` so JS consumers can `import` it; other-language porters fetch it from the repo.

## Decision: frozen oracle, enforced by `toEqual`, never auto-regenerated

`spec/vectors.json` is the committed source of truth. CI asserts `implementation output === vector` with a plain `toEqual`, and the file is **never** regenerated from the implementation.

A generated/snapshot file is rejected: it is circular — it re-derives to match whatever the code currently does, bug included, so it can never catch a regression, which is the entire point of an oracle. Vitest `toMatchSnapshot` is rejected for a subtler reason: it carries the `vitest -u` auto-update footgun, letting a failing assertion be silently re-blessed and quietly breaking the freeze. A plain `toEqual` against the explicit file means the only way to change an expected value is a reviewable edit to the contract. The existing property-based round-trip tests stay as the exhaustive local complement; the vectors are the portable cross-language oracle. A completeness guard asserts every in-scope `(codec, operation)` has at least one vector so coverage cannot silently rot.

## Decision: a three-layer guard against automated un-freezing

This repo's autonomous workflows (`autofix`, `implement`, `address-review`) are wired to make tests pass. A red `toEqual` vector assertion (caused by codec drift) invites the failure mode where an agent "fixes the failing test" by editing `spec/vectors.json` to match the new, wrong output — silently un-freezing the oracle and turning CI green over a wire break. The `toEqual` detection works for agent PRs (their PR goes red); the gap is purely preventing the agent from rewriting the contract to clear it. Three layers, in the repo's existing least-privilege idiom:

1. **Triage routing.** The triage classifier routes any issue whose resolution would change the frozen wire — touching `spec/vectors.json`, `SPEC.md`, or a frozen codec construction — to `ready-for-human`, never `ready-for-agent`. An agent is never dispatched to do spec work in the first place. (Label vocabulary: [docs/agents/triage-labels.md](../agents/triage-labels.md).)
2. **Prompt guard.** The three mutating workflows are told `spec/vectors.json` and `SPEC.md` are the frozen wire oracle: a vector failure means the _code_ drifted — fix the code, or apply `needs-human` and stop. Never edit the vector to match. This reuses the existing declined/deferred escalation idiom already in `address-review.yml`.
3. **`CODEOWNERS` hard gate.** A path-scoped `CODEOWNERS` entry for `spec/` and `SPEC.md` requires a human code-owner review. An agent token cannot satisfy that review, so spec-touching PRs mechanically block for a human while ordinary agent PRs are untouched. This is the load-bearing backstop — a label-presence gate is not, because the mutating agents hold write tokens and can apply a label to themselves.

This mirrors the existing WORKFLOW-FILE GUARD (the agent token deliberately lacks the `workflows` permission so an injected agent cannot rewrite CI): the contract an agent must not silently rewrite is protected structurally, not by trust.

## Considered options

- **Normative spec from day one** — rejected for now: commits publicly before any porter exists, against the project's no-consumer-no-commitment rule, and forces keyed test-key publication and crypto-construction freezing prematurely. Reopen with a concrete porter; elevation is an additive status change.
- **Pure descriptive (internal CI oracle only, no portability framing)** — rejected: forfeits the cross-language-port motivation that prompted the idea for no real saving; the porting framing costs only a paragraph.
- **All six codecs in v1** — rejected: pulls the test-key decision and full crypto-construction freeze into v1 for the unlikely port target; the wire is already fully frozen by the shared-layer vectors without them.
- **Shared wire + UUID only (no Timestamp/Reverse construction vectors)** — rejected: leaves `extractTimestamp` / `generateAt` / the reverse inversion unpinned despite being keyless and deterministic.
- **Single shared version across SPEC + vectors + format** — rejected: invents a format-version the wire deliberately lacks ([ADR-0007](./0007-wire-indistinguishable-codec-variants.md)) and couples doc edits to format identity.
- **Versioned vector filenames (`vectors-1.json`, `vectors-2.json`)** — rejected: duplicates every prior case into each new file; per-version byte-stability is already free via git tags.
- **Generated/snapshot vectors** — rejected: circular, cannot catch a regression. **Vitest `toMatchSnapshot`** — rejected: `-u` auto-update footgun breaks the freeze.
- **Prompt guard only / CI label gate for the freeze** — rejected as sole guard: advisory or actor-untrustworthy (agents hold write tokens). `CODEOWNERS` is the mechanical backstop.

## Consequences

- **New artifacts.** `SPEC.md` at the repo root; `spec/vectors.json` (append-only, `version` field, cases tagged by codec + operation), added to `package.json` `files`. A Vitest suite asserts the reference implementation against the vectors with `toEqual` plus a `(codec, operation)` completeness guard.
- **Repo guards.** A path-scoped `CODEOWNERS` for `spec/` and `SPEC.md`; a freeze-guard line in the `autofix` / `implement` / `address-review` prompts; a triage classification rule routing wire-changing issues to `ready-for-human`.
- **CONTEXT.md** adds **Conformance vector** and **Wire spec** glossary terms.
- **Stability posture.** The spec is descriptive; no conformance claim is offered until a concrete porter appears, at which point elevation to normative is an additive `SPEC.md` status change.
- **Deferred to their own issues**, paired with this one but out of scope here:
  - v2 vector bump adding the keyed-codec construction vectors under in-repo published test-key fixtures (and the formal test-key decision).
  - Elevation to a normative spec with a published conformance suite, on a concrete cross-language porter.
  - The CLI / ORM / DDL UUID surfaces already deferred by [ADR-0024](./0024-uuid-interop-raw-mapping.md), unaffected by this ADR.
