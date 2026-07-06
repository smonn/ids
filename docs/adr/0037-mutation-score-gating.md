---
status: accepted
created: 2026-07-05
last-updated: 2026-07-05
---

# Mutation-score gating: weekly run fails on collapse via `thresholds.break`, no PR-blocking Stryker job

The weekly Stryker run (`mutation.yml`) was fully non-blocking: `stryker.config.json` had no `thresholds` key, so a test-quality regression — a deleted or weakened assertion that leaves mutants surviving — could merge and ship up to a week before a filed issue surfaced, and even a mutation-score collapse was silent. The 2026-07-05 whole-tree audit raised this (finding 7, issue #1003) as a four-way maintainer decision. This ADR records the chosen posture.

## Context

The keyed-codec constructions lean on mutation testing as their quality backstop until conformance vectors v2 land (ADR-0025 defers public vectors), which makes the gate's weakness more expensive than it looks. At decision time the workflow had never produced a score in CI; a local full run on 2026-07-05 established the baseline: **86.93** overall (2192 killed / 307 survived / 25 timed out / 0 uncovered, 2540 mutants, 5m36s).

Two texts documented the old posture and change with it: the `NON-BLOCKING by design` header comment in `.github/workflows/mutation.yml`, and the CONTRIBUTING.md Tests bullet ("non-blocking: surviving mutants are triaged into issues, not red checks").

## Decision

Set `thresholds` in `stryker.config.json`, derived from the measured baseline by a recorded rule so the three numbers have one source:

- **`break: 80`** — baseline minus a ~5-point noise buffer (Stryker's timeout-based kills vary run to run), floored to a multiple of 5. Stryker exits non-zero below this natively, so the weekly `pnpm mutation` step fails with **no workflow change required**.
- **`low: 80`** — equal to `break`: the report grades red exactly when the run fails.
- **`high: 85`** — baseline floored to a multiple of 5: green means "at or above where we started"; the 80–85 band reads as "slipping but not yet failing".

Re-derivation uses the same rule against a fresh full-run score. The posture itself is pinned by `test/mutation-gating.test.ts` (same repo-policy pattern as `test/source-hygiene.test.ts`): removing `thresholds` or lowering `break` below the recorded floor is a red check in ordinary PR CI, so the gate cannot be silently un-gated.

The weekly cadence stays. There is no PR-blocking Stryker job.

## Considered options

1. **Weekly + `thresholds.break` — chosen.** Cheapest to run and to maintain; the score-collapse failure mode becomes loud. The residual cost — up to a week of latency before a survived-mutant regression surfaces — is deliberately accepted because the highest-value slice of that latency is covered elsewhere: audit finding 6 (filed separately) adds per-keyed-codec fixed-byte layout probes to ordinary PR CI, which catch the consistent-but-wrong layout regressions that motivated PR-time mutation gating in the first place, in milliseconds instead of minutes.
2. **Incremental Stryker on PRs touching `src/codecs/**`/`src/wire/**` — rejected.** Catches regressions before merge on the paths that matter, but brings real operational drag: 5–30 minutes added latency on codec-path PRs, incremental-state trust across branches (a stale or poisoned `stryker-incremental.json` silently mis-scores), and timeout-kill flakiness deciding mergeability. With finding 6's probes in PR CI, the marginal catch rate does not pay for that.
3. **Both — rejected.** Inherits option 2's costs; the belt adds little once the braces (option 1 + fixed-byte probes) are on.
4. **Status quo, recorded — rejected.** A one-line acceptance note would have closed the issue, but leaving even score _collapse_ silent on a suite that backstops the keyed codecs is a latency we can remove for the cost of one JSON key.

## Consequences

- A weekly run scoring below 80 fails the `mutation` job; the alert is the red workflow run, not a triaged issue.
- The first gated CI run may score slightly differently from the local baseline (hardware-dependent timeout kills); the 5-point buffer absorbs the expected variance. If it breaks spuriously, re-derive against the CI score using the rule above and bump `last-updated` here.
- `.github/workflows/mutation.yml`'s header comment ("NON-BLOCKING by design … `thresholds.break` is unset") is stale and must be hand-edited by a maintainer — the implementation pipeline's token cannot push workflow files. Until then, the comment is wrong about the config; this ADR is the source of truth.
- Raising `break` later (ratcheting toward the current score) is a one-line change plus a floor bump in `test/mutation-gating.test.ts`; lowering it requires editing a test that links here, which is the intended friction.
