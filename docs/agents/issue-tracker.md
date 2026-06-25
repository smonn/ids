# Issue tracker: GitHub

Issues and PRDs for this repo live as GitHub issues. Use the `gh` CLI for all operations.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> --comments`, filtering comments by `jq` and also fetching labels.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."` — **see the prohibition below before touching labels**.
- **Close**: `gh issue close <number> --comment "..."`

Infer the repo from `git remote -v` — `gh` does this automatically when run inside a clone.

## Pipeline/triage label prohibition

**Agents must not set or remove the pipeline/triage lifecycle labels via `gh issue edit --add-label` or `--remove-label`.** The prohibited labels are the same set guarded by `.claude/hooks/guard-pipeline-labels.mjs` on the MCP path:

`blocked`, `needs-triage`, `ready-for-agent`, `ready-for-human`, `in-progress`, `needs-info`, `wontfix`, `needs-human`, `needs-rebase`

These labels are owned exclusively by the `.github/workflows/` App automations. Setting them by hand races the bot (e.g. `unblock.yml` flips `blocked → needs-triage` when a blocker closes — jumping straight to `ready-for-agent` bypasses that evaluation). Edit issue body, title, or state freely; leave lifecycle labels to the App.

**`address-feedback` and `needs-review` are the only exceptions.** They pass through on the `gh` path for the same reason as on the MCP path: they drive the review lifecycle (re-run automated review / address PR feedback), not triage, and are absent from the guarded set by omission rather than via a positive allowlist.

**Programmatic enforcement:** A `PreToolUse` hook matching `Bash` (`.claude/settings.json` → `.claude/hooks/guard-pipeline-labels-bash.mjs`) parses `gh issue edit --add-label`/`--remove-label` commands and denies any that name a lifecycle label. This covers Claude agent sessions; `gh` calls from `.github/workflows/` CI steps do not route through Claude's Bash tool and are unaffected.

## Declaring blockers on an issue

The pipeline parses two forms from an issue or PR body:

1. **Inline phrase** — a keyword followed (optionally with a trailing colon) by `#N` on the same line:
   - `Blocked by #104`
   - `Depends on #104`
   - `Requires #104`
   - `Blocked by: #104` (colon is optional)
   - All three keywords are accepted case-insensitively.

2. **Heading + bullet list** — a markdown heading containing one of the keywords, followed by `- #N` bullets (one issue per line):
   ```
   ## Blocked by
   - #104
   - #107
   ```
   The heading keyword may be `Blocked by`, `Depends on`, or `Requires` (case-insensitive). Bullets must be `- #N` (with or without the `#`).

Both forms are handled by `.github/scripts/parse-blockers.sh`. Use whichever form fits the issue template — the bullet-list form is what the issue template generates; the inline form is convenient for freeform issues.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments`.
