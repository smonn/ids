# ADR authoring conventions

This file documents the conventions for writing and maintaining Architecture Decision Records (ADRs) in this repository. ADRs live under `docs/adr/` and are numbered sequentially.

For general contribution guidance see [CONTRIBUTING.md](../../CONTRIBUTING.md).

## Front matter

Every ADR starts with a YAML front-matter block carrying its machine-readable metadata — this is what the audit skill's decided-digest and any tooling greps, so prose never needs to restate it:

```yaml
---
status: accepted # proposed | accepted | rejected | superseded
created: 2026-06-24 # date the ADR first landed on main (YYYY-MM-DD)
last-updated: 2026-07-04 # date of the most recent substantive edit
supersedes: ADR-0008 # optional; the ADR this one replaces
superseded-by: ADR-0018 # required when status: superseded
implemented-by: "#317, #318" # optional; implementing PR refs (quote — YAML treats bare # as a comment)
---
```

Rules, enforced by `.github/scripts/adr-front-matter-lint.mjs` (pre-push and CI):

- `status`, `created`, and `last-updated` are required; `status` is one of the four values above; dates are `YYYY-MM-DD` with `last-updated >= created`.
- `status: superseded` requires `superseded-by`, and the pair must be bidirectional: if ADR-A is `superseded-by: ADR-B`, then ADR-B declares `supersedes: ADR-A`. Referenced ADRs must exist.
- Any substantive edit — including adding a correction note — bumps `last-updated`. Typo/formatting-only edits may skip the bump.
- **No commit hashes in front matter.** A hash is unknowable while authoring (the squash-merge SHA doesn't exist yet) and rots on every subsequent edit; `git log -- docs/adr/<file>` already answers provenance questions. Same reasoning as **Verify provenance before citing it** below.

Status semantics: `accepted` is the default for a merged ADR (merge is acceptance); `rejected` records a decision _against_ the design, retained so the question isn't reopened (e.g. ADR-0015); `superseded` means a later ADR replaced this one — keep the in-prose "Superseded by" blockquote too when it carries substance (what replaced what, and why). `proposed` is for an ADR merged ahead of its decision; none exist today.

## Correction notes

When a shipped ADR contains a stale claim — for example, a file path moved by a later refactor, or a status that changed after the ADR reached `main` — annotate it with a dated blockquote immediately after the affected paragraph:

```markdown
> **Correction (YYYY-MM-DD):** _Description of what changed and why, with links to the relevant ADR or PR._
```

**Placement.** The correction note goes immediately after the prose being corrected, not at the end of the ADR. Keeping it adjacent lets a reader see the original reasoning and the update together without jumping to a changelog section.

**When to use a correction note.** Use one when all of the following hold:

- The ADR has already reached `main` (i.e. it shipped).
- The original claim was accurate at the time it was written but has since become stale.
- The historical reasoning must remain visible — for instance, a reader tracing why a design was chosen should still see the original path names or constraints the author had in mind.

Typical triggers: a file or directory moved by a later refactor, an error code or API shape that shipped under a different name than the ADR anticipated, or a "deferred to follow-up" stance that was subsequently resolved.

**When NOT to use a correction note — prefer a silent rewrite instead.** If the incorrect framing predates any real merge — that is, the ADR was still in draft or on a branch that never reached `main` — there is no historical record to preserve. Rewrite the sentence directly rather than leaving a correction note alongside a claim that was never shipped as written.

**Verify provenance before citing it.** A correction note that attributes a change to a PR or commit must verify the attribution first — `git log --diff-filter=A -- <path>` for "added in", `git log -S<symbol>` or `git show <sha> --stat` for behavior changes — rather than inferring it from prose, a blockquote, or memory. If the provenance can't be cheaply verified, omit the attribution and state only what is true now (a dateless "was added later" beats a confident wrong PR number). A correction note whose own claim is false defeats the mechanism: readers trust correction notes precisely because they are the fix for stale claims.

**Format reference.** The seven correction notes across ADR-0014, ADR-0015, and ADR-0017 (dated 2026-06-24, from the ADR-0018 slice refactor) are the canonical live examples of this pattern.
