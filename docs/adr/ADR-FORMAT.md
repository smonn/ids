# ADR authoring conventions

This file documents the conventions for writing and maintaining Architecture Decision Records (ADRs) in this repository. ADRs live under `docs/adr/` and are numbered sequentially.

For general contribution guidance see [CONTRIBUTING.md](../../CONTRIBUTING.md).

## Correction notes

When a shipped ADR contains a stale claim — for example, a file path moved by a later refactor, or a status that changed after the ADR reached `main` — annotate it with a dated blockquote immediately after the affected paragraph:

```markdown
> **Correction (YYYY-MM-DD):** _Description of what changed and why, with links to the
> relevant ADR or PR._
```

**Placement.** The correction note goes immediately after the prose being corrected, not at the end of the ADR. Keeping it adjacent lets a reader see the original reasoning and the update together without jumping to a changelog section.

**When to use a correction note.** Use one when all of the following hold:

- The ADR has already reached `main` (i.e. it shipped).
- The original claim was accurate at the time it was written but has since become stale.
- The historical reasoning must remain visible — for instance, a reader tracing why a design was chosen should still see the original path names or constraints the author had in mind.

Typical triggers: a file or directory moved by a later refactor, an error code or API shape that shipped under a different name than the ADR anticipated, or a "deferred to follow-up" stance that was subsequently resolved.

**When NOT to use a correction note — prefer a silent rewrite instead.** If the incorrect framing predates any real merge — that is, the ADR was still in draft or on a branch that never reached `main` — there is no historical record to preserve. Rewrite the sentence directly rather than leaving a correction note alongside a claim that was never shipped as written.

**Format reference.** The seven correction notes across ADR-0014, ADR-0015, and ADR-0017 (dated 2026-06-24, from the ADR-0018 slice refactor) are the canonical live examples of this pattern.
