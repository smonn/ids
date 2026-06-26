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

## Authoring issues for the agent pipeline

When filing findings (e.g. from an audit) as issues, the issue body is the steering wheel: `triage.yml` reads it and routes to `ready-for-agent` / `ready-for-human` / `wontfix` / `needs-info`, and `ready-for-agent` chains into `implement.yml`, which builds the change test-first and opens the PR. You do not set lifecycle labels (see the prohibition above); you make triage route correctly by how you write the issue.

**Don't restate what already owns these rules — link to them and follow them:**

- **Routing rubric** (agent vs human, the CLOSED-decisions list, and the rule that any change touching `.github/workflows/*` is forced to `ready-for-human` because the implement agent's App token lacks `workflows` permission) lives in the `triage.yml` job prompt.
- **Issue fields** — motivation, desired behavior, the `Out of scope / non-goals` fence, codec variant, affected surface, the agent-readiness self-check — live in the issue templates under `.github/ISSUE_TEMPLATE/`. Use them.
- **`Blocked by #N` syntax, the lifecycle-label prohibition, and `gh` mechanics** are above in this file and in `AGENTS.md`.

**What this section adds (not encoded elsewhere):**

1. **"Ready-for-human" means resolved in-session with the maintainer**, who holds full permissions (including `workflows`) — not a hand-off that blocks until someone does manual work. So a finding that must edit a workflow file is done in a working session like this one, not by the autonomous pipeline.

2. **Slice for the pipeline, not just for humans:**
   - **One issue per finding by default**, each sized to finish in a single `implement.yml` turn. Prefer small: a fat "roundup" can exhaust an implementing agent's turn budget and mixes unrelated diffs. Trivial one-line _doc_ fixes may be batched into one roundup.
   - **Make each issue's file set disjoint.** `implement.yml` opens one PR per issue and they run in parallel; multiple PRs editing the same file conflict and churn `rebase.yml`. So when several findings touch the same file, **group sub-findings by the file they touch** (e.g. all `reverse/index.test.ts` work in one issue) rather than by finding type. A cross-file fix that would otherwise collide with several issues should be _dissolved into_ those per-file issues, or chained ahead of them with `Blocked by #N`.
   - **Resolve embedded design decisions before filing as `ready-for-agent`.** If a finding has a genuine trade-off, either decide the direction and bake it into the acceptance criteria (with the rejected option in `Out of scope`), or file it as a maintainer-decision issue that presents the trade-off without prescribing an answer. Never leave an implementing agent to guess — and never file something that reopens a CLOSED decision as agent-ready.

3. **Durable audit findings go in `docs/audits/<name>-<date>.md`** as a dated, point-in-time snapshot — non-authoritative, superseded once issues are filed, and free of invented issue numbers so it can't rot against GitHub.
