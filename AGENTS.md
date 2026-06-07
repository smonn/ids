# smonn-ids

## Agent skills

### Issue tracker

Issues live in GitHub Issues on `smonn/ids`, accessed via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### GitHub workflow

- Use the repository issue templates when creating GitHub issues, unless the user explicitly asks for a quick/freeform issue.
- Use the repository PR template when opening pull requests.
- Link the originating issue from PRs when one exists.
- Consider whether a changeset is needed for user-visible changes, especially public API, CLI behavior, docs that affect package usage, or release-note-worthy fixes.

### Triage labels

Default canonical vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context repo: `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
