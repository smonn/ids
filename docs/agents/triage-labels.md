# Triage Labels

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
> **Exception — `address-feedback` and `needs-review`.** These two review-lifecycle labels are _not_ denied by the guard. They pass through because they are **absent from the hook's `LIFECYCLE` set by omission, not via a positive allowlist** — there is no dedicated carve-out entry, they are simply not listed. A `PreToolUse` hook cannot verify actor identity, so this is not a maintainer-only grant: **any agent session may set them**, and the trade-off is accepted because they control the review lifecycle (re-run automated review / address PR feedback), not the triage lifecycle.

The autonomous workflows in `.github/workflows/` use additional labels to track an issue's state as it moves through triage → implementation → review. These are applied by the App, not by the `mattpocock/skills` vocabulary.

| Label              | Applied by                                        | Meaning                                                                                                                                                                                                             |
| ------------------ | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `blocked`          | `triage.yml`                                      | Depends on another open issue (`Blocked by #N` / `Depends on #N`). Parked until the blocker closes, when `unblock.yml` flips it back to `needs-triage`.                                                             |
| `in-progress`      | `implement.yml`                                   | An agent has opened a PR implementing this issue (replaces `ready-for-agent`).                                                                                                                                      |
| `needs-human`      | `rebase.yml`, `autofix.yml`, `address-review.yml` | An agent-driven workflow could not complete automatically and needs manual attention (merge conflict, CI autofix exhausted, or escalated review feedback).                                                          |
| `needs-review`     | maintainer → `review.yml`                         | Apply to an agent PR to re-run the automated code review. Removed automatically when the run starts.                                                                                                                |
| `needs-rebase`     | maintainer → `rebase.yml`                         | Apply to an agent PR to merge the latest `main` into its branch and resolve conflicts with Claude. Rebase is opt-in — there is no automatic rebase on every `main` push. Removed automatically when the run starts. |
| `address-feedback` | maintainer → `address-review.yml`                 | Apply to an agent PR after leaving review feedback to have the agent read the reviews/inline threads and address them (one commit per fix), replying in-thread. Removed automatically when the run starts.          |

### Issue state machine

```
needs-triage ──► ready-for-agent ──► in-progress ──► (PR review / merge)
     │                  ▲
     ├──► needs-info    │
     ├──► ready-for-human
     ├──► wontfix
     └──► blocked ──(blocker closes)──► needs-triage
```
