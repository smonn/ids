# Triage Labels

> **Namespaced taxonomy — fully rolled out.** This repo uses a namespaced `namespace:value` label grammar ([ADR-0029](../adr/0029-namespaced-label-taxonomy.md)) with a hard status/trigger split ([ADR-0030](../adr/0030-label-status-vs-triggers.md)). **All five rollout phases have landed:** the descriptive auto-labels are applied automatically, the lifecycle workflows write the namespaced `issue:`/`pr:` status, the pipeline fires only on `do:*` triggers, and **Phase 4 has retired the old flat lifecycle/trigger labels** (`needs-triage`, `ready-for-agent`, `needs-review`, `conflicting`, `auto-round-N`, …) — they are deleted by `labels.yml` and no longer read or written. `needs-human` is the lone surviving flat label (cross-cutting escalation). The namespaced set is now the authoritative vocabulary.

## Lifecycle status (`issue:` / `pr:`)

Every issue carries exactly one `issue:` status and every PR exactly one `pr:` status; these are **status** labels ([ADR-0030](../adr/0030-label-status-vs-triggers.md)) — descriptive, single-select by convention, and **never** in a workflow's `labeled` filter, so writing one starts no pipeline work. The owning workflow removes the other values of the namespace when it sets one.

| Status | Set by | Meaning |
| --- | --- | --- |
| `issue:triage` | `unblock.yml` (transient, when re-triaging) | Awaiting maintainer evaluation |
| `issue:needs-info` | `triage.yml` | Waiting on the reporter for more information |
| `issue:ready-agent` | `triage.yml` | Fully specified, ready for an AFK agent (pure backlog status — does **not** trigger implementation) |
| `issue:ready-human` | `triage.yml`, `implement.yml` (escalation) | Requires human implementation |
| `issue:in-progress` | `implement.yml` | An agent has opened a PR implementing this issue |
| `issue:blocked` | `triage.yml` | Parked on an open blocker; `unblock.yml` re-triages when it closes |
| `issue:wontfix` | `triage.yml` | Will not be actioned |
| `pr:reviewing` | `review.yml` | Automated code review in progress on the head commit |
| `pr:changes-requested` | `review.yml` | Review left hard findings to address |
| `pr:addressing-feedback` | `address-review.yml` | An agent is addressing the review feedback |
| `pr:ready` | `review.yml` | Reviewed, no blocking findings |
| `pr:outdated` | review/address workflows | A push post-dates the last review |

The single-select set/clear lives in `.github/scripts/lifecycle-status.sh` (`set_issue_status` / `set_pr_status`), sourced by the lifecycle workflows. `automation:rebasing` is an orthogonal **pause-mutex** (not a `pr:` value): while any `automation:*` label is present every PR-triggered workflow no-ops, so nothing acts on a soon-to-be-superseded commit. `needs-human` stays flat (cross-cutting "all automation gave up" escalation, no namespace) per ADR-0029.

## Descriptive auto-labels

Two deterministic workflows apply the descriptive namespaced labels — they add triage/archival signal but are **inert**: every label here is a [status label](../adr/0030-label-status-vs-triggers.md) (never read by any workflow's `labeled` filter), so applying one starts no pipeline work.

| Namespace | Applied by | On | Sourced from |
| --- | --- | --- | --- |
| `type:` | `pr-labels.yml` / `issue-labels.yml` | PR + issue | PR: the Conventional-Commit title (`pr-title.yml`). Issue: `bug` → `type:fix`, `enhancement` → `type:feat`. |
| `size:` | `pr-labels.yml` | PR | Calibrated absolute diff churn (additions + deletions), excluding lockfiles. `xs ≤10` · `s ≤50` · `m ≤150` · `l ≤400` · `xl >400`. |
| `codec:` | `pr-labels.yml` / `issue-labels.yml` | PR + issue | PR: changed `src/codecs/<variant>/` paths. Issue: the "Relevant codec variant" form dropdown. |
| `area:` | `pr-labels.yml` / `issue-labels.yml` | PR + issue | PR: changed paths (`wire`/`cli`/`adapters`/`docs`/`core`/`build`). Issue: the "Affected surface" form dropdown. |
| `changeset:` | `pr-labels.yml` | PR | The highest bump declared across the `.changeset/*.md` files the PR introduces (`patch`/`minor`/`major`/`none`). |

The classification logic is a set of pure functions in `.github/scripts/label-classifier.mjs` (unit-tested in the sibling `.test.mjs`); the workflows gather inputs and apply the result, and the Phase 5 backfill (`.github/scripts/backfill-labels.mjs`) imports the same functions so live and historical labels match. These auto-labels are **not** in the agent-prohibited set below — they are App-maintained, but an agent setting one races nothing, since no workflow reads them.

Only same-repo PRs are auto-labelled (a forked PR has no secrets to mint the App token); the **Phase 5 backfill** covers the rest. It is a one-time `workflow_dispatch` (`.github/workflows/backfill-labels.yml`, dry-run by default) that stamps the mechanical descriptive labels across open **and** closed items and the `issue:` lifecycle status on open issues — reusing the Phase 1 classifiers (`label-classifier.mjs`) and the lifecycle mapping (`lifecycle-classifier.mjs`, the JS mirror of `lifecycle-status.sh`). An open issue with no recoverable lifecycle history defaults to `issue:triage` (the entry state). `released:*` is not backfilled — `release.yml` stamps `released:v1` when v1 cuts.

## Triggers (`do:*`)

The `do:*` namespace is the **only** set of labels that starts a workflow (the load-bearing invariant of ADR-0030: no status label ever triggers). Each trigger is an explicit imperative; the workflow it starts **consumes** (removes) it, so it can be re-applied to re-fire.

| Trigger        | Starts               | Replaces (retired)               |
| -------------- | -------------------- | -------------------------------- |
| `do:triage`    | `triage.yml`         | `needs-triage`                   |
| `do:implement` | `implement.yml`      | `ready-for-agent` (as a trigger) |
| `do:review`    | `review.yml`         | `needs-review`                   |
| `do:rebase`    | `rebase.yml`         | `needs-rebase`                   |
| `do:address`   | `address-review.yml` | `address-feedback`               |

**The `ready-for-agent` split is complete.** `issue:ready-agent` is pure backlog status that never triggers; `do:implement` is the explicit kickoff. Marking issues `issue:ready-agent` no longer spawns agents — a maintainer kicks the ones they want with `do:implement`, in the order and at the concurrency they want. (`review.yml`, `autofix.yml`, and `release.yml` stay event-driven — CI completion, PR sync, a published tag — and need no `do:*`.)

**Guard-hook deny-set.** The shared `LIFECYCLE` set in `.claude/hooks/lifecycle-labels.mjs` covers the namespaced `issue:`/`pr:` status labels, `automation:rebasing`, flat `needs-human`, and the **maintainer-only** kickoff triggers `do:implement` / `do:rebase` / `do:triage`. The review-lifecycle triggers `do:review` / `do:address` remain agent-settable (absent from the set by omission, not a positive allowlist) — a `PreToolUse` hook cannot verify actor identity, and these drive the review lifecycle, not triage.

## Triage role vocabulary

The `mattpocock/skills` triage skills speak in terms of five canonical roles. This table maps those roles to the actual label strings this repo uses.

| Role in mattpocock/skills | Label in our tracker | Meaning |
| --- | --- | --- |
| `needs-triage` | `do:triage` (trigger) → `issue:triage` (status) | Maintainer needs to evaluate this issue |
| `needs-info` | `issue:needs-info` | Waiting on reporter for more information |
| `ready-for-agent` | `issue:ready-agent` (+ `do:implement` to kick) | Fully specified, ready for an AFK agent |
| `ready-for-human` | `issue:ready-human` | Requires human implementation |
| `wontfix` | `issue:wontfix` | Will not be actioned |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label string from this table.

## Pipeline state labels

> **Ownership — App only, not agents.** Every `issue:`/`pr:` status label, `automation:rebasing`, flat `needs-human`, and the maintainer-only kickoff triggers (`do:implement` / `do:rebase` / `do:triage`) are _pipeline_ labels owned by the `.github/workflows/` automations. **Agents must not set or remove them.** When a blocker closes, `unblock.yml` applies `do:triage` (and resets the status to `issue:triage`) so triage re-evaluates — it never jumps an issue straight to `issue:ready-agent`, so doing that by hand both usurps the App and lands the wrong state. A `PreToolUse` hook (`.claude/settings.json` → `.claude/hooks/guard-pipeline-labels.mjs`) denies any `mcp__github__issue_write` that includes one of these labels. Edit issue body/title/state as needed; leave the lifecycle labels to the App.
>
> **Exception — `do:review` / `do:address`.** These review-lifecycle triggers are _not_ denied by the guard. They pass through because they are **absent from the hook's `LIFECYCLE` set by omission, not via a positive allowlist**. A `PreToolUse` hook cannot verify actor identity, so this is not a maintainer-only grant: **any agent session may set them**, and the trade-off is accepted because they control the review lifecycle (re-run automated review / address PR feedback), not triage.

### Issue state machine

```
do:triage ──► issue:triage ──► issue:ready-agent ──(do:implement)──► issue:in-progress ──► (PR review / merge)
                   │                  ▲
                   ├──► issue:needs-info
                   ├──► issue:ready-human
                   ├──► issue:wontfix
                   └──► issue:blocked ──(blocker closes → do:triage)──► issue:triage
```
