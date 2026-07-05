# smonn-ids

## Agent skills

### Issue tracker

Issues live in GitHub Issues on `smonn/ids`, accessed via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### GitHub workflow

- Before filing, break work into the smallest independently-shippable issues along natural seams; prefer a `Blocked by #N` chain (additive foundation first, then the change that depends on it) over one oversized issue, which can exhaust an implementing agent's turn budget before it opens a PR. Give every split issue an explicit `Out of scope` fence naming the sibling issue that owns the deferred work.
- A PR's docs (`README` / `CONTEXT.md` / ADR / the `website/` docs site) describe only behavior that PR ships — don't pre-document a sibling/blocked issue's work or an unmerged design. Adding an export updates the API-surface list; documenting how it behaves waits for the PR that implements it.
- The `website/src/content/docs/` Starlight site mirrors the source slices almost 1:1 (`src/adapters/<name>.ts` ↔ `adapters/<name>.md`, `src/codecs/<name>/` ↔ `codecs/<name>.md`, `src/cli/` ↔ `cli.md`, `src/error.ts` ↔ `errors.md`). When a PR changes behavior in one of those slices, update the matching page in the **same** PR — the TypeDoc API reference regenerates itself, but these hand-written narrative pages do not. The `docs-coverage` CI check posts a sticky comment and **fails the PR** when source changes without the mapped page; update the page, or waive with a `No docs update needed: <reason>` line in the PR body when the source change does not affect the page.
- Use the repository issue templates when creating GitHub issues, unless the user explicitly asks for a quick/freeform issue.
- Use the repository PR template when opening pull requests.
- Link the originating issue from PRs when one exists.
- Consider whether a changeset is needed for user-visible changes, especially public API, CLI behavior, docs that affect package usage, or release-note-worthy fixes.

### Triage labels

Default canonical vocabulary, namespaced (ADR-0029): `do:triage` → `issue:triage`, `issue:needs-info`, `issue:ready-agent`, `issue:ready-human`, `issue:wontfix`. See `docs/agents/triage-labels.md`.

**Agents must not set or remove pipeline/triage lifecycle labels** — the namespaced `issue:`/`pr:` status labels, `automation:rebasing`, flat `needs-human`, and the maintainer-only kickoff triggers `do:implement` / `do:rebase` / `do:triage` — **on either access path — MCP (`mcp__github__issue_write`) or `gh` CLI (`gh issue edit --add-label`/`--remove-label`)**. (Phase 4 of ADR-0029 retired the flat lifecycle/trigger labels — `needs-triage`, `ready-for-agent`, `needs-review`, … — so they no longer exist.) Those transitions are owned exclusively by the `.github/workflows/` App automations — e.g. when a blocker closes, `unblock.yml` applies `do:triage` and triage re-evaluates; it never jumps straight to `issue:ready-agent`. Setting them by hand races the bot. Two `PreToolUse` hooks in `.claude/settings.json` enforce this: one denies `mcp__github__issue_write` calls that include a lifecycle label (`.claude/hooks/guard-pipeline-labels.mjs`), and one denies `Bash` calls to `gh issue edit --add-label`/`--remove-label` with a lifecycle label (`.claude/hooks/guard-pipeline-labels-bash.mjs`). Both hooks import the guarded label set from a single shared source (`.claude/hooks/lifecycle-labels.mjs`) so the two lists cannot drift. Set issue body/title/state freely; leave the lifecycle labels to the App.

The review-lifecycle triggers `do:review` and `do:address` are the exception: the guards do **not** deny them. They pass through because they are **absent from both hooks' `LIFECYCLE` set by omission, not via a positive allowlist**. Since a `PreToolUse` hook cannot verify actor identity, **any agent session may set them** (not just monitoring sessions) — accepted because they drive the review lifecycle, not triage.

### Domain docs

Single-context repo: `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

### Harness scratch dirs

The CI harness runs five agent pipelines (implement, address, review, triage, autofix). Each writes a `*-context/` input dir and a producer-output dir into the working tree: `.impl{,-context}/`, `.address{,-context}/`, `.review{,-context}/`, `.triage{,-context}/`, `.autofix{,-context}/`. These are ephemeral and not developer-authored — every one is listed in both `.gitignore` and `.oxfmtrc.json`'s `ignorePatterns`. **Never commit them and never `git add -f` them into a PR**; a PR's diff should only ever contain the change it ships.

If a tool complains about a file under one of these dirs (e.g. a formatter or hook), **fix the tool, not the ignore lists** — do not edit `.gitignore` or `.oxfmtrc.json` to un-ignore a scratch dir, and do not commit a scratch file to satisfy a check. The soft-wrap hook already treats oxfmt's "no target files" exit (a file excluded by `ignorePatterns`) as a pass for exactly this reason. PR #621 regressed by removing patterns and committing `.impl/` output to silence the hook; that is the anti-pattern this rule exists to prevent.

## Markdown style

Write Markdown prose **soft-wrapped**: one source line per paragraph, with no hard line breaks mid-paragraph — let the editor/renderer wrap. Do not manually break a paragraph across multiple source lines at a fixed column. This applies to all `.md`/`.mdx` files in the repo (the same rule covers prose inside list items and blockquotes).

This is enforced statically by oxfmt: `.oxfmtrc.json` sets `proseWrap: "never"` for Markdown, and CI runs `pnpm fmt:check`. Run `pnpm fmt` (`oxfmt`) to reflow before committing. A `PostToolUse` hook (`.claude/hooks/markdown-softwrap.mjs`) also re-checks any Markdown you write or edit and asks you to reflow if it drifts.

The Starlight docs site under `website/` is the one exception: oxfmt's CommonMark/GFM formatter corrupts Starlight `:::` container directives (asides), so `website/**` is excluded from the `proseWrap` override and keeps oxfmt's default `preserve`. Don't add the soft-wrap override to `website/`.
