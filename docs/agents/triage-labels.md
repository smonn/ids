# Triage Labels

> **Planned migration.** This file documents the **current** flat label set. A namespaced `namespace:value` taxonomy (`issue:`, `pr:`, `type:`, `size:`, `codec:`, `area:`, `changeset:`, `released:`, `do:*`, …) has been accepted in [ADR-0029](../adr/0029-namespaced-label-taxonomy.md) and [ADR-0030](../adr/0030-label-status-vs-triggers.md). The flat lifecycle/trigger labels below remain authoritative for now; the ADRs describe what they migrate to (e.g. `ready-for-agent` → `issue:ready-agent` status plus a `do:implement` trigger). **Phases 1–3 of that rollout have landed:** the descriptive auto-labels under [Descriptive auto-labels](#descriptive-auto-labels-phase-1) are applied automatically, the lifecycle workflows [dual-write the namespaced status](#namespaced-lifecycle-status-mirror-phase-2) beside each flat label, and the pipeline workflows now [also fire on the `do:*` triggers](#trigger-cutover-phase-3) alongside the legacy flat triggers. The flat triggers keep working until Phase 4 retires them.

## Namespaced lifecycle status mirror (Phase 2)

Wherever a lifecycle workflow sets a flat lifecycle label it now **also writes the namespaced `issue:`/`pr:` status** (ADR-0029 Phase 2), so the namespaced set is populated before Phase 3 flips any trigger onto it. The flat labels stay authoritative through the transition; the namespaced ones are inert mirrors (status, never in a `labeled` filter) and writing them is best-effort — a status label failing to land never fails the job.

| Flat label | Namespaced mirror | Written by |
| --- | --- | --- |
| `needs-triage` | `issue:triage` | `unblock.yml` (re-triage); removed when a decision lands |
| `needs-info` | `issue:needs-info` | `triage.yml` |
| `ready-for-agent` | `issue:ready-agent` | `triage.yml` |
| `ready-for-human` | `issue:ready-human` | `triage.yml`, `implement.yml` (escalation) |
| `in-progress` | `issue:in-progress` | `implement.yml` |
| `blocked` | `issue:blocked` | `triage.yml` |
| `wontfix` | `issue:wontfix` | `triage.yml` |
| (automated review starts on a commit) | `pr:reviewing` | `review.yml` |
| (hard review findings → `address-feedback`) | `pr:changes-requested` | `review.yml` |
| (clean review) | `pr:ready` | `review.yml` |
| (addressing review feedback) | `pr:addressing-feedback` | `address-review.yml` |

The mapping and the single-select set/clear live in `.github/scripts/lifecycle-status.sh` (`set_issue_status` / `set_pr_status`), sourced by each workflow. Each namespace is single-select: setting one value removes the sibling values currently present. `needs-human` stays flat (cross-cutting escalation, no namespace) per ADR-0029.

## Descriptive auto-labels (Phase 1)

Two deterministic workflows apply the descriptive namespaced labels — they add triage/archival signal but are **inert**: every label here is a [status label](../adr/0030-label-status-vs-triggers.md) (never read by any workflow's `labeled` filter), so applying one starts no pipeline work.

| Namespace | Applied by | On | Sourced from |
| --- | --- | --- | --- |
| `type:` | `pr-labels.yml` / `issue-labels.yml` | PR + issue | PR: the Conventional-Commit title (`pr-title.yml`). Issue: `bug` → `type:fix`, `enhancement` → `type:feat`. |
| `size:` | `pr-labels.yml` | PR | Calibrated absolute diff churn (additions + deletions), excluding lockfiles. `xs ≤10` · `s ≤50` · `m ≤150` · `l ≤400` · `xl >400`. |
| `codec:` | `pr-labels.yml` / `issue-labels.yml` | PR + issue | PR: changed `src/codecs/<variant>/` paths. Issue: the "Relevant codec variant" form dropdown. |
| `area:` | `pr-labels.yml` / `issue-labels.yml` | PR + issue | PR: changed paths (`wire`/`cli`/`adapters`/`docs`/`core`/`build`). Issue: the "Affected surface" form dropdown. |
| `changeset:` | `pr-labels.yml` | PR | The highest bump declared across the `.changeset/*.md` files the PR introduces (`patch`/`minor`/`major`/`none`). |

The classification logic is a set of pure functions in `.github/scripts/label-classifier.mjs` (unit-tested in the sibling `.test.mjs`); the workflows gather inputs and apply the result, and the Phase 5 backfill imports the same functions so live and historical labels match. These auto-labels are **not** in the agent-prohibited set below — they are App-maintained, but an agent setting one races nothing, since no workflow reads them.

Only same-repo PRs are auto-labelled (a forked PR has no secrets to mint the App token); the Phase 5 backfill covers the rest.

## Trigger cutover (Phase 3)

Each pipeline workflow's `labeled` filter now accepts **both** the legacy flat trigger and its `do:*` successor, so a maintainer can drive the pipeline with either during the cutover (ADR-0030). The workflow consumes (removes) whichever trigger fired, so it can be re-applied to re-fire.

| Workflow             | Legacy trigger     | `do:*` trigger (also accepted) |
| -------------------- | ------------------ | ------------------------------ |
| `triage.yml`         | `needs-triage`     | `do:triage`                    |
| `implement.yml`      | `ready-for-agent`  | `do:implement`                 |
| `review.yml`         | `needs-review`     | `do:review`                    |
| `rebase.yml`         | `needs-rebase`     | `do:rebase`                    |
| `address-review.yml` | `address-feedback` | `do:address`                   |

**The `ready-for-agent` split.** `issue:ready-agent` is now pure backlog status (dual-written in Phase 2, never triggers); `do:implement` is the explicit kickoff. During the cutover `triage.yml` still applies the legacy `ready-for-agent`, which keeps auto-chaining into `implement.yml`; a maintainer can instead apply `do:implement` to kick a specific issue. When Phase 4 retires `ready-for-agent`, marking issues `issue:ready-agent` no longer spawns agents — you kick the ones you want with `do:implement`.

**Guard-hook update.** The shared `LIFECYCLE` deny-set in `.claude/hooks/lifecycle-labels.mjs` now also covers the namespaced `issue:`/`pr:` status labels, `automation:rebasing`, and the **maintainer-only** kickoff triggers `do:implement` / `do:rebase` / `do:triage`. The review-lifecycle triggers `do:review` / `do:address` remain agent-settable (the same carve-out as their `needs-review` / `address-feedback` predecessors).

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual label strings used in this repo's issue tracker.

| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`    | Requires human implementation            |
| `wontfix`                  | `wontfix`            | Will not be actioned                     |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label string from this table.

Edit the right-hand column to match whatever vocabulary you actually use.

## Pipeline state labels

> **Ownership — App only, not agents.** Every label in the state machine below (and `ready-for-agent` / `ready-for-human` / `needs-triage` / `needs-info` / `wontfix` above) is a _pipeline_ label owned by the `.github/workflows/` automations. **Agents must not set or remove them.** When a blocker closes, `unblock.yml` flips `blocked → needs-triage` and triage re-evaluates — it never jumps an issue straight to `ready-for-agent`, so doing that by hand both usurps the App and lands the wrong state. A `PreToolUse` hook (`.claude/settings.json` → `.claude/hooks/guard-pipeline-labels.mjs`) denies any `mcp__github__issue_write` that includes one of these labels. Edit issue body/title/state as needed; leave the lifecycle labels to the App.
>
> **Exception — `address-feedback` / `needs-review` and their `do:*` successors `do:address` / `do:review`.** These review-lifecycle triggers are _not_ denied by the guard. They pass through because they are **absent from the hook's `LIFECYCLE` set by omission, not via a positive allowlist** — there is no dedicated carve-out entry, they are simply not listed. A `PreToolUse` hook cannot verify actor identity, so this is not a maintainer-only grant: **any agent session may set them**, and the trade-off is accepted because they control the review lifecycle (re-run automated review / address PR feedback), not the triage lifecycle. The other kickoff triggers — `do:implement` / `do:rebase` / `do:triage` — _are_ in the deny-set (maintainer kickoff control), as are the namespaced `issue:`/`pr:` status labels and `automation:rebasing`.

The autonomous workflows in `.github/workflows/` use additional labels to track an issue's state as it moves through triage → implementation → review. These are applied by the App, not by the `mattpocock/skills` vocabulary.

| Label | Applied by | Meaning |
| --- | --- | --- |
| `blocked` | `triage.yml` | Depends on another open issue (`Blocked by #N` / `Depends on #N`). Parked until the blocker closes, when `unblock.yml` flips it back to `needs-triage`. |
| `in-progress` | `implement.yml` | An agent has opened a PR implementing this issue (replaces `ready-for-agent`). |
| `needs-human` | `rebase.yml`, `autofix.yml`, `address-review.yml` | An agent-driven workflow could not complete automatically and needs manual attention (merge conflict, CI autofix exhausted, or escalated review feedback). |
| `needs-review` | maintainer → `review.yml` | Apply to an agent PR to re-run the automated code review. Removed automatically when the run starts. |
| `needs-rebase` | maintainer → `rebase.yml` | Apply to an agent PR to merge the latest `main` into its branch and resolve conflicts with Claude. Rebase is opt-in — there is no automatic rebase on every `main` push. Removed automatically when the run starts. |
| `address-feedback` | maintainer → `address-review.yml` | Apply to an agent PR after leaving review feedback to have the agent read the reviews/inline threads and address them (one commit per fix), replying in-thread. Removed automatically when the run starts. |

### Issue state machine

```
needs-triage ──► ready-for-agent ──► in-progress ──► (PR review / merge)
     │                  ▲
     ├──► needs-info    │
     ├──► ready-for-human
     ├──► wontfix
     └──► blocked ──(blocker closes)──► needs-triage
```
