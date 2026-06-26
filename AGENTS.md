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

**Agents must not set or remove pipeline/triage lifecycle labels** (`blocked`, `needs-triage`, `ready-for-agent`, `ready-for-human`, `in-progress`, `needs-info`, `wontfix`, `needs-human`, `needs-rebase`) **on either access path — MCP (`mcp__github__issue_write`) or `gh` CLI (`gh issue edit --add-label`/`--remove-label`)**. Those transitions are owned exclusively by the `.github/workflows/` App automations — e.g. when a blocker closes, `unblock.yml` flips `blocked → needs-triage` and triage re-evaluates; it never jumps straight to `ready-for-agent`. Setting them by hand races the bot. Two `PreToolUse` hooks in `.claude/settings.json` enforce this: one denies `mcp__github__issue_write` calls that include a lifecycle label (`.claude/hooks/guard-pipeline-labels.mjs`), and one denies `Bash` calls to `gh issue edit --add-label`/`--remove-label` with a lifecycle label (`.claude/hooks/guard-pipeline-labels-bash.mjs`). Both hooks import the guarded label set from a single shared source (`.claude/hooks/lifecycle-labels.mjs`) so the two lists cannot drift. Set issue body/title/state freely; leave the lifecycle labels to the App.

The review-lifecycle labels `address-feedback` and `needs-review` are the exception: the guards do **not** deny them. They pass through because they are **absent from both hooks' `LIFECYCLE` set by omission, not via a positive allowlist**. Since a `PreToolUse` hook cannot verify actor identity, **any agent session may set them** (not just monitoring sessions) — accepted because they drive the review lifecycle, not triage.

### Domain docs

Single-context repo: `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Markdown style

Write Markdown prose **soft-wrapped**: one source line per paragraph, with no hard line breaks mid-paragraph — let the editor/renderer wrap. Do not manually break a paragraph across multiple source lines at a fixed column. This applies to all `.md`/`.mdx` files in the repo (the same rule covers prose inside list items and blockquotes).

This is enforced statically by oxfmt: `.oxfmtrc.json` sets `proseWrap: "never"` for Markdown, and CI runs `pnpm fmt:check`. Run `pnpm fmt` (`oxfmt --write`) to reflow before committing. A `PostToolUse` hook (`.claude/hooks/markdown-softwrap.mjs`) also re-checks any Markdown you write or edit and asks you to reflow if it drifts.

The Starlight docs site under `website/` is the one exception: oxfmt's CommonMark/GFM formatter corrupts Starlight `:::` container directives (asides), so `website/**` is excluded from the `proseWrap` override and keeps oxfmt's default `preserve`. Don't add the soft-wrap override to `website/`.
