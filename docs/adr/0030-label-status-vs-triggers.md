# Labels: status vs. triggers, and the no-status-triggers invariant

Split every issue/PR label into one of two kinds. A **status** label is bot-maintained, descriptive, single-select by convention, and **never starts a workflow** — an accidental second value is reconciled on the next pass, not acted on. A **trigger** label (`do:*`, [ADR-0029](./0029-namespaced-label-taxonomy.md)) is an explicit imperative that the workflow it starts **consumes** (removes). The governing invariant: **no status label ever triggers a workflow; every workflow start is a `do:*` trigger or a native git event.**

This is a design-acceptance gate. Implementation — the per-workflow filter changes, the `automation:` mutex, the start/stop labelling contract, and the CI lint — is deferred to follow-up issues filed after this ADR reaches `main`, and is sequenced as Phase 3–4 of the [ADR-0029](./0029-namespaced-label-taxonomy.md) rollout.

## Why: GitHub has no mutual exclusion, so a status that triggers is a misfire waiting to happen

GitHub enforces neither single-select nor namespacing — "one value at a time" is only a convention the App workflows defend. So the design question is what an accidental double-label _costs_:

- If a status label could also trigger, then `pr:ready` + `pr:outdated` both present (a stray hand-edit, a race, an `unblock`-style re-add) could fire a workflow on the wrong one. A cosmetic slip becomes an action.
- If status labels are purely descriptive, the same double-label is **harmless** — the next bot pass reconciles to one value, and nothing ran. The only things that ever start a workflow are explicit `do:*` triggers and native events (push / PR-sync / CI-completion).

That safety margin is the whole reason for the split. The current system already leans this way — its triggers (`needs-review`, `ready-for-agent`, …) fire on the `labeled` event and are removed when consumed — but it never stated the invariant, and it lets a _lifecycle_ label double as a trigger (`ready-for-agent`). This ADR makes the invariant absolute.

## Decision

### Two kinds

- **Status** — bot-maintained, single-select by convention (the owning workflow removes the other values when it sets one), describes a condition. Never appears in a workflow's `labeled` filter. Examples: all of `issue:`, `pr:`, `type:`, `size:`, `codec:`, `area:`, `changeset:`, `released:`, `automation:`, `auto-round:`, and flat `needs-human`.
- **Trigger** — the `do:*` namespace: `do:implement`, `do:review`, `do:rebase`, `do:address`, `do:triage`. An explicit imperative; the workflow it starts removes it. Workflows fire only on a `do:*` label or a native event; `autofix.yml` (CI-completion) and `release.yml` stay event-driven and need no `do:*`.

### `ready-for-agent` is split, not promoted

Today `ready-for-agent` is both a status ("fully specified") and a trigger (adding it fires `implement.yml`). It is split: `issue:ready-agent` becomes **pure backlog status**, and `do:implement` starts the work. This separates _mechanism_ ("start work now") from _policy_ ("when does work start"). Marking five issues `issue:ready-agent` no longer spawns five agents; you kick the ones you want, in the order and at the concurrency you want. Auto-start, if ever wanted, becomes opt-in policy — a small separate workflow that adds `do:implement` when `issue:ready-agent` appears — never welded into `implement.yml`.

### Start/stop labelling contract

Each workflow manages its own status namespace:

- **On start:** remove the `do:*` trigger that fired it; set the in-progress status (`pr:reviewing`, `pr:addressing-feedback`, `issue:in-progress`, …).
- **On stop:** clear in-progress; set the outcome status (`pr:ready` / `pr:changes-requested`) or nothing.

Branch-mutation work additionally sets the `automation:*` mutex (`automation:rebasing`) while running; every PR-triggered workflow no-ops while any `automation:*` is present, so nothing acts on a soon-to-be-superseded commit. This replaces the magic-word `conflicting` check with a namespace check.

### The invariant is CI-lintable

Because no status label may appear in a `labeled` filter, the rule is mechanically checkable: a CI lint asserts that every `.github/workflows/*.yml` job gated on a `labeled` event filters on a `do:*` label (or is explicitly exempted). This is the standing guarantee that a future edit can't quietly re-introduce a status-as-trigger.

## Considered options

- **Unify — state-as-trigger (pattern "a").** Make each lifecycle namespace a single-select machine whose _entry_ is the trigger, reacting to the `labeled` event. Rejected: it is exactly the misfire case above — with no native mutual exclusion, two contradictory values fire a workflow, and a cosmetic slip becomes an action.
- **Three-tier: a small enumerated set of "handoff" states trigger on entry.** Let `issue:ready-agent` (only) trigger, while review outcomes never do. Rejected: it welds policy ("auto-start") into mechanism, keeps a permanent documented exception the lint can't express, and re-opens the bug class where status churn (an `unblock` re-add, a re-triage) re-fires `implement.yml` — the reason idempotency guards exist today.
- **Purist split (adopted):** even `issue:ready-agent` does not trigger; `do:implement` does. One more label-add per kicked issue — which _is_ the kickoff control, not overhead — in exchange for a uniform model, an absolute grep-auditable invariant, and the elimination of the status-churn-re-fire bug class.

## Consequences

- **The safety property becomes auditable and permanent:** "status never triggers" is enforced by CI, not by discipline; re-introducing a status-as-trigger fails the lint.
- **The maintainer gains explicit kickoff control** over the agent pipeline (`do:implement`), decoupled from "this issue is ready."
- **Two guard hooks must track the split.** `.claude/hooks/guard-pipeline-labels.mjs` and `guard-pipeline-labels-bash.mjs` currently allow `needs-review`/`address-feedback` through by omission from a hardcoded lifecycle set; under the `do:*` model those become `do:review`/`do:address`, and the guarded `issue:`/`pr:` status set is what agents must not hand-set. The hook edits land with the Phase 3 trigger cutover ([ADR-0029](./0029-namespaced-label-taxonomy.md)).
- **`address-review.yml` no longer owns a label namespace** — it writes the shared `pr:addressing-feedback` status rather than a private `address:*`, keeping the PR's whole review↔address story in one single-select `pr:` machine.
