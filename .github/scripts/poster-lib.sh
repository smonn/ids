#!/usr/bin/env bash
# poster-lib.sh — shared primitives for the deterministic poster steps.
#
# This file is SOURCED, not executed: callers run `source .github/scripts/poster-lib.sh`
# from inside a workflow `run:` step that has already set `set -euo pipefail`. It defines
# functions ONLY and runs NO top-level code, so sourcing it neither changes the caller's
# shell options nor performs any action — it just makes the functions below available.
# (It deliberately does NOT set its own `set -euo pipefail`; the callers own that state.)
#
# Only the snippets that are byte-identical (modulo a single parameter) across multiple
# posters live here. Each poster's distinct mutation sequence stays inline in its
# workflow; this library centralizes the two primitives that were copy-pasted verbatim:
#   - require_manifest: the producer-output guard (all 5 posters)
#   - push_branch:      the one-shot token-in-URL push (address-review, implement, autofix)
#
# The `escalate` pattern (comment + label) is intentionally NOT extracted: it varies
# materially across callers (issue vs PR comment/edit; implement also removes
# ready-for-agent; autofix and address-review use needs-human; address-review has its own
# distinct branch-moved path), so a single function would be leaky and over-parameterized.
# It stays inline in each poster.

# require_manifest <dir>
#
# Guard that the producer actually wrote a parseable manifest under <dir>. Fails the
# step loudly (exit 1) with the exact `::error::` wording each poster used inline, with
# <dir> interpolated. Two checks, in order:
#   1. <dir>/manifest.json exists.
#   2. <dir>/manifest.json is valid JSON (`jq empty`).
# Example: require_manifest .review
require_manifest() {
  dir=$1
  test -f "$dir/manifest.json" || { echo "::error::producer wrote no $dir/manifest.json"; exit 1; }
  jq empty "$dir/manifest.json" || { echo "::error::$dir/manifest.json is not valid JSON"; exit 1; }
}

# push_branch <branch>
#
# The one-shot, token-in-URL push used by the address-review, implement, and autofix
# posters. Pushes the current HEAD to <branch> on the origin repo, building a one-off
# push credential from the token so nothing is persisted in the git config.
#
# Requires GH_TOKEN and GH_REPO to be set in the caller's environment (the deterministic
# poster step provides both). The token appears ONLY inside the remote-URL argument and
# is NEVER echoed; stdout and stderr are redirected to /dev/null so the URL (and thus the
# token) can't leak into the run log.
#
# Returns the push exit status (it does NOT exit), so callers can branch on it — e.g.
#   if push_branch "$BRANCH"; then ...pushed... else ...branch-moved handling... fi
# which is how address-review detects a non-fast-forward rejection.
push_branch() {
  branch=$1
  git push "https://x-access-token:${GH_TOKEN}@github.com/${GH_REPO}.git" "HEAD:${branch}" >/dev/null 2>&1
}
