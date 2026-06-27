# Namespaced label taxonomy for issues and PRs

Replace the repo's flat issue/PR label set with a uniform `namespace:value` grammar. Each namespace declares a **select-arity** — single-select (a state machine, one value live) or multi-select (free tags) — and a **kind** (descriptive _status_ vs. imperative _trigger_; the status/trigger split and its safety rationale are [ADR-0030](./0030-label-status-vs-triggers.md)). The flat labels in `.github/workflows/labels.yml` are the migration's source; the namespaced set is the target, and the two coexist only during the rollout.

This is a design-acceptance gate. Implementation — the `labels.yml` rewrite, the auto-labelling workflows, the per-workflow filter changes, the guard-hook edits, the doc updates, and the one-time backfill — is deferred to follow-up issues filed after this ADR reaches `main`.

## Why now

Three things converge before 1.0:

- **The label set is flat and partly unmanaged.** `labels.yml` is the documented single source of truth, yet `bug` and `enhancement` are applied by the issue templates' `labels:` field and never appear in `labels.yml` — so they have no synced colour or description and live outside the weekly self-heal. Any new descriptive axis (size, scope) would compound that drift.
- **There is no descriptive vocabulary at all.** A PR's size, the codec it touches, its semver impact, and the release it shipped in are invisible from the issue/PR list. For a library whose work is sharply partitioned by codec slice (ADR-0018) and frozen wire surface (ADR-0025), that is a real loss of triage and archival signal.
- **Renaming labels is cheapest now.** At `1.0.0-rc.0` with no tags, the version-line axis (`released:v1`) is about to become meaningful, and the in-flight item count (~700 issues+PRs) is only going to grow. A rename touches 14 workflows, two guard hooks, the templates, and the docs; doing it pre-1.0, before more automation accretes around the flat strings, is the low-water mark.

## Decision: a `namespace:value` grammar with declared arity

Every label is `namespace:value`. The colon is notation; the design primitive is **arity** (how many values of a namespace may be live) and **kind** (status vs. trigger, per ADR-0030). GitHub enforces neither mutual exclusion nor namespacing — both are conventions the App workflows defend, and "single-select" means "the owning workflow removes the other values when it sets one."

| Namespace | Kind | Arity | Applies to | Values | Sourced from |
| --- | --- | --- | --- | --- | --- |
| `type:` | status | single | issue + PR | `feat` `fix` `docs` `refactor` `perf` `test` `build` `ci` `chore` `revert` | PR: parsed from the enforced Conventional-Commit title (`pr-title.yml`); issue: template + triage |
| `issue:` | status | single | issue | `triage` `ready-agent` `ready-human` `in-progress` `blocked` `needs-info` `wontfix` | triage/implement/unblock workflows |
| `pr:` | status | single | PR | `reviewing` `changes-requested` `addressing-feedback` `ready` `outdated` | review/address-review workflows |
| `automation:` | status (mutex) | single | PR | `rebasing` (later `releasing`) | conflicts/rebase workflows |
| `size:` | status | single | PR | `xs` `s` `m` `l` `xl` | auto: diff churn |
| `changeset:` | status | single | PR | `patch` `minor` `major` `none` | auto: `.changeset/*.md` frontmatter |
| `codec:` | status | multi | issue + PR | `timestamp` `opaque` `reverse` `signed` `wrapped` `digest` | PR: changed paths; issue: template dropdown |
| `area:` | status | multi | issue + PR | `wire` `cli` `adapters` `docs` `core` `build` | PR: changed paths; issue: template dropdown |
| `released:` | status | multi | issue + PR | `v1` (later `v2`, …) | `release.yml` when a commit lands in a published tag on that major line |
| `auto-round:` | status | single | PR | `1` `2` `3` | `address-review.yml` (range tracks `MAX_AUTO_ROUNDS`) |
| `do:` | **trigger** | n/a (consumed) | issue + PR | `implement` `review` `rebase` `address` `triage` | maintainer/agent; removed by the workflow it starts |
| `needs-human` | status | flat (un-namespaced) | issue + PR | — | 5 workflows |

Notable cross-decisions baked into the table:

- **`type:` rides the Conventional-Commit vocabulary**, not a parallel `bug`/`enhancement` set, because `pr-title.yml` already enforces that vocabulary on titles. On PRs the label is derived from the title and therefore can never disagree with it; on issues the only mapping is `bug`→`type:fix`, `enhancement`→`type:feat`. One enforced language across both objects, no mapping table.
- **`issue:` and `pr:` are the symmetric object-lifecycle pair.** Every issue carries exactly one `issue:` value; every PR exactly one `pr:` value. The `pr:` machine absorbs the whole review↔address cycle (`reviewing → changes-requested → addressing-feedback → reviewing → ready`, with `outdated` set when a push post-dates the last review) rather than spawning a separate `address:` namespace.
- **`automation:` is an orthogonal pause-mutex, not a `pr:` value.** A rebase is independent of review state — folding `rebasing` into the single-select `pr:` namespace would erase the review state for the duration of the rebase. Other workflows pause while any `automation:*` is present (this generalises today's magic-word `conflicting` check).
- **`released:` is keyed on the major version _line_, not the semver version.** `released:v1` (later `v2`) is multi-select so a back-ported fix shipped in two lines carries both. Per-semver-version labels (`released:1.4.0`) were rejected — see Considered options.
- **`needs-human` stays flat.** It is a cross-cutting "all automation gave up" escalation fired from five workflows on both objects; a namespace buys nothing and complicates five grep sites.

## Colours: urgency on state labels, quiet tints on descriptive ones

Saturated colour is spent on what the text does _not_ convey at a glance — **urgency** — extending the intent already present in today's `labels.yml`:

- **Red** — needs attention: `needs-human`, `issue:blocked`, `pr:changes-requested`
- **Green** — good/go: `issue:ready-agent`, `pr:ready`, `released:*`
- **Yellow** — waiting: `issue:triage`, `issue:needs-info`, `pr:outdated`
- **Blue/purple** — active: `issue:in-progress`, `pr:reviewing`, `pr:addressing-feedback`, `do:*`

The descriptive, auto-derived namespaces (`type:*`, `size:*`, `codec:*`, `area:*`, `changeset:*`, `auto-round:*`) carry no urgency, so they get no saturated colour — the actionable state labels keep the colour budget, and an issue/PR list still scans as "red needs me, green is done."

**Amendment (post-acceptance):** these descriptive labels were originally all flat grey (`EDEDED`). In a long issue/PR list that produced an undifferentiated grey blob — you could not tell a `codec:` chip from a `size:` chip from a `type:` chip without reading each one. The wholesale "colour-by-namespace" rejection below conflated two cases: it is correct for **state** namespaces (`issue:`, `pr:`), where a single namespace hue would hide the `ready`-vs-`blocked` urgency difference colour exists to surface — but for the descriptive namespaces every value is equally informational, so a per-namespace hue buries **no** signal. The only remaining objection (redundant with the prefix text) is weak because colour is preattentive: at list-scan distance the block of colour registers before the text is read.

So the descriptive namespaces now get a **quiet per-namespace tint** instead of flat grey: one low-saturation hue per namespace, drawn from hues the urgency set does not use (slate-blue, teal, clay, lavender — _not_ pastel red/green/yellow/purple), kept light enough that a descriptive label never out-shouts or is mistaken for a state label. `size:` additionally ramps light→dark (`xs`→`xl`) to encode magnitude, the one ordinal axis whose meaning the text does not give at a glance. `auto-round:` stays grey — it is ephemeral and carries no triage value. The exact hexes live in `labels.yml`; this is a cosmetic, `labels.yml`-only change (no workflow filters on colour).

## `size:` is calibrated absolute churn, not a percentage

`size:` buckets total diff churn (additions + deletions), excluding generated/vendored files. A `.gitattributes` marks `pnpm-lock.yaml` (and future lockfiles) `linguist-generated=true`; the size workflow excludes generated paths, but `spec/vectors.json` and the depcruise fixtures **count** — they are reviewable content. Thresholds are calibrated to the measured ~6k production LoC:

`xs ≤10` · `s ≤50` · `m ≤150` · `l ≤400` · `xl >400`

Percentage-of-codebase was rejected: review burden is _absolute_ (200 lines is 200 lines to read regardless of repo size), the denominator is ambiguous (% of `src/`? of production? of the repo?), and a percentage is a moving target that silently shrinks a PR's label as the codebase grows. Blast radius — "how much of the system this touches" — is `scope:`'s job (`codec:`/`area:`), not `size:`'s.

## Migration: additive-first, riskiest-last, then backfill

A big-bang rename would break 14 workflows at once. The rollout keeps every intermediate state shippable and reversible:

- **Phase 0 — Foundation.** Add the namespaced labels to `labels.yml` _alongside_ the old ones; add the `.gitattributes` lockfile rule. Labels exist; nothing reads them.
- **Phase 1 — Descriptive auto-labels.** Ship the workflows that apply `type:` / `size:` / `codec:` / `area:` / `changeset:`. New capability, replaces nothing, inert (triggers nothing).
- **Phase 2 — Lifecycle status (`issue:` / `pr:`).** Dual-write new status beside old (`in-progress` + `issue:in-progress`). Safe because status is inert; readers switch over lazily.
- **Phase 3 — Triggers (`do:*`).** Flip the `labeled` filters per workflow, but during cutover accept _both_ old and new (`needs-review` OR `do:review`) so nothing breaks mid-migration. Update the two guard hooks' lifecycle sets in lock-step.
- **Phase 4 — Retire + enforce.** Delete the old `ensure` lines, run an explicit `gh label delete` for retired labels (the weekly self-heal only creates/updates — it never deletes), and add the CI lint from [ADR-0030](./0030-label-status-vs-triggers.md) ("every `labeled` filter matches a `do:*`").
- **Phase 5 — Backfill.** A one-time script that _imports the same classification functions the Phase 1 workflows use_, so historical and live labels are produced by identical logic.

**Backfill scope.** Mechanical (deterministic) labels are applied across **open and closed** items — `type:` (PR title / issue `bug`/`enhancement`), `size:` (diff), `codec:`/`area:` (paths). ~700 items × ~3 API calls is minutes of work, far under rate limits, and triggers nothing because no workflow filters on these. Lifecycle status (`issue:`/`pr:`) is backfilled on **open items only** — a closed item's state already _is_ "closed." Judgment-only labels (`codec:`/`area:` on issues without a dropdown) and `released:` (no tags yet) are skipped now; `released:v1` is stamped when v1 cuts.

**Implementation note (Phase 5).** Two refinements surfaced once Phase 4 _deleted_ the flat lifecycle labels (which strips them from items) ahead of the backfill. First, **only `issue:` lifecycle is backfilled, not `pr:`** — the `pr:` namespace is new in this taxonomy, so no retired flat label mapped to a `pr:` review _status_ (`needs-review`/`address-feedback`/`conflicting` became the `do:*` triggers and the `automation:rebasing` mutex). An open PR therefore has no historical source to reconstruct from; its `pr:` status is bot-written going forward, and the Phase 2 dual-write already covers any open PR that has been reviewed. Inventing a review state from nothing would be worse than leaving it unset. Second, an open issue's `issue:` status is recovered from its timeline label events (which retain the now-deleted flat label's _name_); an open issue with **no** recoverable lifecycle history defaults to `issue:triage` — the entry state (== the retired `needs-triage`), since an open, untriaged issue genuinely awaits maintainer evaluation. Both are status writes and trigger nothing (ADR-0030).

## Considered options

- **Per-semver-version `released:1.4.0`** — rejected. One new label per release forever bloats the picker, and dynamically-created labels have no `ensure` line, breaking the single-source-of-truth + weekly self-heal invariant. Major-line `released:v1` is bounded and statically enumerable; per-version filtering, if ever wanted, belongs on milestones, not labels.
- **Percentage-based `size:`** — rejected (see above): ambiguous denominator, moving target, and it duplicates `scope:`'s blast-radius role.
- **Per-adapter `adapter:` namespace** — deferred, not adopted. Ten adapters would be ten labels for thin integration shims; `area:adapters` is coarse enough to start, and a hot adapter can be promoted later additively with no migration. Codecs earn per-variant labels because they are the core surface with dedicated ADRs and a template dropdown.
- **Colour-by-namespace** — rejected _for state namespaces_, because for `issue:`/`pr:` it makes `issue:ready` and `issue:blocked` look identical, hiding exactly the distinction colour should surface. The "redundant with the prefix text" half of this objection does **not** hold for the descriptive namespaces, which carry no within-namespace urgency to hide and benefit from a preattentive per-namespace tint — see the amendment in §Colours.
- **Big-bang rename** — rejected: 14 workflows match exact strings; a single cutover has no reversible intermediate state. The additive-first phasing trades a few PRs for safety.
- **Reporter-friendly `bug`/`enhancement` `type:` nouns with a CC mapping** — rejected: a mapping table to maintain plus a permanent mismatch between a PR's `type:` word and its own enforced CC title. Unified CC vocabulary needs no mapping and stays consistent by construction.

## Consequences

- **Blast radius is wide but mechanical:** `.github/workflows/labels.yml` (rewrite), 14 workflows matching label strings (316 references), the two guard hooks (`.claude/hooks/guard-pipeline-labels.mjs`, `guard-pipeline-labels-bash.mjs`) whose hardcoded lifecycle sets must track the renames, the issue templates' `labels:` fields and dropdowns, `docs/agents/triage-labels.md` and `docs/agents/issue-tracker.md`, and a new `.gitattributes`.
- **Net new labels** add descriptive triage/archival signal (`type`/`size`/`codec`/`area`/`changeset`/`released`) the flat set never had — at the cost of more labels overall, mitigated by namespacing them into discoverable groups and giving the inert ones quiet per-namespace tints (see §Colours) so they recede without becoming an undifferentiated grey blob.
- **The single-source-of-truth invariant is preserved**: every label remains statically enumerable in `labels.yml` (the reason `released:` is line-keyed, not version-keyed), so the weekly self-heal keeps working unchanged.
- **The flat names survive through the entire transition**, so no in-flight issue or PR is stranded mid-migration; retirement is an explicit, auditable Phase 4 step, not a side effect.
