---
name: monitor-prs
description: Monitor open pull requests and route each event to the correct automation action.
disable-model-invocation: true
---

# Monitor PRs

Observe incoming PR events and route each one to a single, correct automation action. End your turn immediately after acting. Never stay alive polling.

## PR discovery

**If PR numbers are passed as arguments:** use those PRs as the watch set. Skip the confirmation step and go straight to the routing table.

**If no arguments are supplied:**
1. Query all open PRs: `gh pr list --state open --json number,title,labels,headRefName`.
2. For each PR, surface its current state:
   - Labels (lifecycle + triage).
   - Unresolved review thread count — `gh pr view --json reviews` returns review submission objects, not thread resolution state; use the GraphQL API:
     `gh api graphql -f query='query($n:Int!){repository(owner:"smonn",name:"ids"){pullRequest(number:$n){reviewThreads(first:100){nodes{isResolved}}}}}' -F n={number} | jq '[.data.repository.pullRequest.reviewThreads.nodes[]|select(.isResolved==false)]|length'`
   - CI status: `gh pr checks {number} --json name,state,conclusion`.
3. Present the list to the user with that state inline. Ask the user to confirm the watch set and note any PRs to exclude before you act on any event.

## Routing table

Evaluate exactly one case per event. Apply the single action shown. End your turn.

### CI failure — agent branch

Determine whether the failure is infra noise (flaky runner, network timeout, unrelated quota) or a real failure in the PR code.

- **Infra noise:** re-run the failed jobs with `gh run rerun --failed <run-id>`. End your turn.
- **Real failure:** apply the `address-feedback` label. End your turn.

### CI failure — non-agent branch

Diagnose the failure: read the failing step logs (`gh run view <run-id> --log-failed`), identify the root cause, and report a concise summary to the user. Do not apply labels. Do not commit. End your turn.

### Review posted, hard findings — agent branch

Confirm that `address-feedback` is applied to the PR.
- Auto after #220 — verify the label is present; if not, apply it manually.
- Manual otherwise — apply the label now.

End your turn.

### Review posted, hard findings — non-agent branch

File a new GitHub issue for each hard finding using the appropriate `.github/ISSUE_TEMPLATE/`. Do not fix inline. Do not commit to the PR branch. End your turn.

### Review posted, soft / judgment-call findings only

Scan the PR review threads. Resolve any thread that already has a reply (the finding has been acknowledged). Do not apply `address-feedback`. End your turn.

### `address-feedback` run completed

Confirm that `needs-review` is applied to the PR.
- Auto after #218 — verify the label is present; if not, apply it manually.
- Manual otherwise — apply the label now.

End your turn.

### Rebase completed

Confirm that `needs-review` is applied to the PR.
- Auto after #219 — verify the label is present; if not, apply it manually.
- Manual otherwise — apply the label now.

End your turn.

### Open thread with fix already committed

For each open review thread where the fix is visible in a subsequent commit: reply to the thread citing the short SHA (`git log --oneline` or `gh pr view --json commits`). Resolve the thread. End your turn.

### All checks green, all threads resolved

Report to the user: "PR #N is ready to merge." Do not merge. End your turn.

### Event needs no action

Skip silently. End your turn.

## Stop conditions

End your turn immediately after every routing action. Never loop back, never poll, never wait for a follow-up event in the same turn.

## Constraints

- **No commits on the monitoring branch.** This skill is read-only for its own execution context.
- **No commits on agent branches.** Routing actions are label operations and issue creation only — never code edits, rebases, or force-pushes on another branch.
- **No bundling.** Handle one event per turn. If multiple events are pending, pick the most recent and end your turn; the next invocation handles the next event.
- **No lifecycle labels.** Do not set or remove pipeline / triage lifecycle labels (`blocked`, `needs-triage`, `ready-for-agent`, `ready-for-human`, `in-progress`, `needs-info`, `wontfix`, `needs-human`, `needs-review`, `needs-rebase`, `address-feedback`) except as explicitly required by the routing table cases above.

## Escalation rules

Escalate — post a summary to the user and ask before acting — when any of the following is true:

- **CLOSED design decision:** a review finding or failure requires reopening brand format, payload byte layout, canonical `is()`, monotonicity, custom epoch, Opaque key behavior, or wire-indistinguishable codec variants. Do not act; surface the finding and the tension.
- **Repeated CI failure:** the same PR has had CI fail 3 or more times with no fix committed between failures. Report the pattern and ask the user how to proceed.
- **Architectural judgment required:** a conflict, finding, or failure cannot be resolved without a design decision above the routing table authority (e.g. API shape, ADR amendment, cross-issue dependency). Summarize the conflict and ask the user.
