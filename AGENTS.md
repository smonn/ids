# smonn-ids

## Agent skills

### Issue tracker

Issues live in GitHub Issues on `smonn/ids`, accessed via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### GitHub workflow

- Before filing, break work into the smallest independently-shippable issues along natural seams; prefer a `Blocked by #N` chain (additive foundation first, then the change that depends on it) over one oversized issue, which can exhaust an implementing agent's turn budget before it opens a PR. Give every split issue an explicit `Out of scope` fence naming the sibling issue that owns the deferred work.
- A PR's docs (`README` / `CONTEXT.md` / ADR) describe only behavior that PR ships — don't pre-document a sibling/blocked issue's work or an unmerged design. Adding an export updates the API-surface list; documenting how it behaves waits for the PR that implements it.
- Use the repository issue templates when creating GitHub issues, unless the user explicitly asks for a quick/freeform issue.
- Use the repository PR template when opening pull requests.
- Link the originating issue from PRs when one exists.
- Consider whether a changeset is needed for user-visible changes, especially public API, CLI behavior, docs that affect package usage, or release-note-worthy fixes.

### Triage labels

Default canonical vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

**Agents must not set or remove pipeline/triage lifecycle labels** (`blocked`, `needs-triage`, `ready-for-agent`, `ready-for-human`, `in-progress`, `needs-info`, `wontfix`, `needs-human`, `needs-rebase`). Those transitions are owned exclusively by the `.github/workflows/` App automations — e.g. when a blocker closes, `unblock.yml` flips `blocked → needs-triage` and triage re-evaluates; it never jumps straight to `ready-for-agent`. Setting them by hand races the bot. A `PreToolUse` hook in `.claude/settings.json` denies `mcp__github__issue_write` calls that include these labels. Set issue body/title/state freely; leave the lifecycle labels to the App.

**Exception — monitoring agent:** A session acting as the PR monitor (watching for review comments, driving the address-feedback → needs-review loop, and merging once CI is green) may set `address-feedback` and `needs-review` on agent PRs. These two labels are designated "maintainer-applied" in `docs/agents/triage-labels.md` and the hook allows them explicitly.

### Domain docs

Single-context repo: `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
