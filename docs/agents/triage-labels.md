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

The autonomous workflows in `.github/workflows/` use additional labels to track an issue's state as it moves through triage → implementation → review. These are applied by the App, not by the `mattpocock/skills` vocabulary.

| Label          | Applied by                | Meaning                                                                                                                                                                                                             |
| -------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `blocked`      | `triage.yml`              | Depends on another open issue (`Blocked by #N` / `Depends on #N`). Parked until the blocker closes, when `unblock.yml` flips it back to `needs-triage`.                                                             |
| `in-progress`  | `implement.yml`           | An agent has opened a PR implementing this issue (replaces `ready-for-agent`).                                                                                                                                      |
| `needs-human`  | `rebase.yml`              | A PR's merge conflict could not be resolved automatically and needs manual attention.                                                                                                                               |
| `re-review`    | maintainer → `review.yml` | Apply to an agent PR to re-run the automated code review. Removed automatically when the run starts.                                                                                                                |
| `needs-rebase` | maintainer → `rebase.yml` | Apply to an agent PR to merge the latest `main` into its branch and resolve conflicts with Claude. Rebase is opt-in — there is no automatic rebase on every `main` push. Removed automatically when the run starts. |

### Issue state machine

```
needs-triage ──► ready-for-agent ──► in-progress ──► (PR review / merge)
     │                  ▲
     ├──► needs-info    │
     ├──► ready-for-human
     ├──► wontfix
     └──► blocked ──(blocker closes)──► needs-triage
```
