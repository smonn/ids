---
name: audit
description: Multi-dimensional codebase audit — dimension reviews gated against decided ADRs, then grill each finding into file-or-drop.
disable-model-invocation: true
---

An **audit** runs the same shape every time: load what's already **decided**, review across many dimensions in parallel, then **grill** every finding into file-or-drop. Two rules carry the predictability — never re-raise a settled decision, never skip the grill.

## Phase 0 — Load the decided set (gate)

Do this **before** any reviewer runs; its output is an input to every one of them.

1. **Pin scope.** Ask: the whole source tree, or the diff since a fixed point (commit / branch / tag / merge-base)? For a diff, capture `git diff <point>...HEAD` and confirm it resolves and is non-empty (fail here, not inside a sub-agent).
2. **Read the decided record:** every `docs/adr/*.md` (title + the `status:` field in its YAML front matter — proposed / accepted / rejected / superseded, plus `superseded-by`; see `docs/adr/ADR-FORMAT.md`), `CONTEXT.md`, `SPEC.md` (especially "closed", "rejected", "not yet frozen", "deferred to v2"), and any `CODING_STANDARDS.md` / `CONTRIBUTING.md`.
3. **Read the prior dispositions:** the "Dropped (with reason)" and "Already decided — not raised" sections of every `docs/audits/*.md` snapshot. A disposition recorded there is decided for gate purposes unless the code at that site has since changed — recurring re-drops (a finding raised and dropped in two or more snapshots) especially must reach the digest, or every fresh reviewer rediscovers them.
4. **Write the decided digest:** one line per settled question — `<topic> → ADR-N (status)`, or `<topic> → dropped (<snapshot date>): <reason>` for snapshot-only dispositions. This digest is the gate.

**Completion criterion:** every ADR with a terminal status appears as one digest line, every prior-snapshot drop appears as one digest line, and the digest is ready to paste verbatim into every Phase 1 reviewer.

## Phase 1 — Review across dimensions (parallel)

Launch one sub-agent per dimension in [`DIMENSIONS.md`](DIMENSIONS.md), all in a **single message** so they run concurrently. Hand each agent the **shared reviewer contract** from `DIMENSIONS.md` (it carries the gate rule and the finding schema), plus the scope (tree or diff command), the area/file map, and the **decided digest** from Phase 0. Where a dimension overlaps an existing review skill — `/code-review`, `/simplify`, `/security-review` — point the agent at it for the angle. Scale the roster to the codebase, and add a dimension when it warrants one.

The gate is non-negotiable: every reviewer drops or `closed:ADR-N`-tags anything a digest line or ADR settles (the rule and schema live in `DIMENSIONS.md`) — a decided thing is never raised as actionable.

**Completion criterion:** every dimension has reported, and each finding is sorted into **Open** or **Closed-by-ADR** with a citation.

## Phase 2 — Aggregate

One ranked report: Open findings by severity across dimensions, plus a short **"already decided — not raised"** appendix listing the Closed-by-ADR items and their citation. The appendix is the visible proof the gate worked.

**Completion criterion:** a single report the user can read top-to-bottom; no raw sub-agent dumps.

## Phase 3 — Decide & file

1. **Grill.** Run `grill-with-docs` over the **Open** findings — one finding (or one bucket sharing a disposition) at a time, each with your **recommended disposition**, cross-checking the ADRs once more. Outcome per finding: **file** (tagged ready-agent / low-priority / post-1.0) or **drop(reason)**. Resolve any embedded design trade-off here, or the finding cannot be filed agent-ready.
2. **File** the keepers per [`docs/agents/issue-tracker.md`](../../../docs/agents/issue-tracker.md): one issue per finding, disjoint file sets, `Blocked by #N` chains when findings share a file, the issue templates, and **no lifecycle/triage labels** (the App owns those).

**Completion criterion:** every Open finding has a recorded disposition, and every "file" decision has a created issue (or the user explicitly chose to file later).
