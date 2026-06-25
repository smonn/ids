# Issue tracker: GitHub

Issues and PRDs for this repo live as GitHub issues. Use the `gh` CLI for all operations.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> --comments`, filtering comments by `jq` and also fetching labels.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <number> --comment "..."`

Infer the repo from `git remote -v` — `gh` does this automatically when run inside a clone.

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
