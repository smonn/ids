# Workflow gate logic: single-source helpers, with the tested-twin reserved for pre-checkout gates

Extract a workflow's non-trivial gate logic — round-counter state machines, blocker-state aggregation, scope decisions — into a pure `.mjs` helper under `.github/scripts/`, **invoked directly by the step** and unit-tested. Reserve the hand-synced _tested-twin_ pattern (a `.mjs` that mirrors authoritative inline bash it can never call) for the one case that forces it: a gate that must run **before checkout**.

## Why: two extraction shapes already coexist, and only one carries a drift liability

The repo extracts workflow logic in two structurally different ways, and the difference was implicit until now:

- **Single source of truth.** The step runs `node`/`bash`/`source` on a repo file (`lifecycle-status.sh`, `parse-blockers.sh`, `label-classifier.mjs` via `classify-*.mjs`, `label-trigger-lint.mjs`, …). The file _is_ the implementation; its tests test the real code. There is one copy. This is the shape of ~11 of the 12 extracted helpers.
- **Tested twin.** `review-scope.mjs` re-encodes the scope decision that `review.yml` makes in inline bash. The bash is authoritative at runtime; the `.mjs` is a hand-maintained mirror that exists only to be unit-tested. There are two copies, synced by human discipline, and **nothing fails CI when the bash drifts from the twin** — the tests test the `.mjs`, not the bash.

A twin buys a regression-locked, readable spec of the rules; it does **not** guarantee the live bash matches that spec. That standing drift liability is only worth paying when there is no alternative.

## Why the twin is sometimes unavoidable: the secret-free pre-checkout gate

`review.yml` decides scope _before_ it mints the App token (the token step is `if: steps.scope.outputs.review == 'true'`) and _before_ checkout, on purpose:

- **Secret-free rejection.** Fork and out-of-scope events never mint a write-scoped token and never run repo code. Deciding scope after checkout would mint a secret for every drive-by event the workflow is about to discard.
- **Never run untrusted code to make a trust decision.** Checking out a PR head first and then running a gate script _from that checkout_ lets a malicious PR rewrite its own gate (force `proceed`, or exfiltrate the token) — a pwn-request vector. The decision that gates trust must come from trusted code: inline YAML, or a script from a trusted ref — never the untrusted checkout.

A step that runs before checkout cannot `import` a repo file, so its only testable form is a twin. That is the whole justification for `review-scope.mjs`, and it is the boundary of the pattern.

## Decision

- **Default to single-source helpers.** When a gate step runs _after_ checkout, extract its non-trivial decision logic into a pure `.mjs` the step invokes (STDIN JSON → STDOUT JSON, mirroring `classify-*.mjs`; pure functions exported for tests, a `main()` guarded by `process.argv[1] === fileURLToPath(import.meta.url)`, mirroring `label-trigger-lint.mjs`). The workflow bash keeps all `gh`/`git` I/O and applies the returned decision. One copy, tested directly.
- **Reserve the tested twin for pre-checkout gates only.** A twin is justified solely when the step must run before checkout to stay secret-free / to avoid executing untrusted code. `review-scope.mjs` is that case. Do not add twins for post-checkout steps, and do not "DRY away" `review-scope.mjs` by trying to call it from `review.yml` — its step cannot import a repo file.
- **First applications.** `blocker-status.mjs` (resolution + open-list formatting, shared by `triage.yml` and `unblock.yml`) and `address-gate.mjs` (the runaway auto-address loop decision in `address-review.yml`) ship as single-source helpers. Both steps already run post-checkout.

## Considered options

- **Twin everything (extend the `review-scope.mjs` pattern to every gate).** Rejected: pays the drift liability everywhere, including the post-checkout majority where a single source is available for free. The user framing was blunt — writing every rule twice and syncing by hand is not worth it where it isn't forced.
- **Add `bats` and keep the logic in bash.** Rejected: introduces a second test toolchain for what `.mjs` + the existing vitest run already cover, and bash is harder to test than the equivalent pure function.
- **Leave the logic inline.** Rejected for the two genuine state machines: the address-review gate is a five-way precedence ladder over a label-encoded counter, and blocker aggregation is duplicated verbatim across two workflows. Both are exactly the "intricate rules, real consequences" case where a tested spec earns its keep. Thinner glue (e.g. `autofix.yml`'s two-line attempt cap) stays inline.

## Consequences

- **No new drift surface.** The two new helpers are the real implementation, tested directly; there is nothing to keep in lock-step.
- **`review-scope.mjs` stays a deliberate one-off**, documented here so a later reader does not mistake it for tech debt or replicate it for post-checkout gates.
- **System node is assumed at gate time.** These helpers run before `setup-node-pnpm`, relying on the runner's preinstalled Node — consistent with the existing `classify-*.mjs` steps, which also run unset up. They import only local files and use no dependencies.
