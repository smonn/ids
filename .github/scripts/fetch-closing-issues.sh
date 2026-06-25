#!/usr/bin/env bash
set -euo pipefail

# Read a PR body on STDIN, parse the closing references
# (Closes/Fixes/Resolves #N), fetch each referenced issue, and write a markdown
# issue digest to STDOUT. Shared by review.yml and address-review.yml (each
# redirects this output into its own context file).
#
# Uses `gh issue view`; callers already have GH_TOKEN (and GH_REPO) in env, which
# this script inherits. Never fails the build if an issue can't be read.

pr_body=$(cat)

issues=$(printf '%s' "$pr_body" \
  | grep -oiE '(close[sd]?|fix(e[sd])?|resolve[sd]?)[[:space:]]+#[0-9]+' \
  | grep -oE '[0-9]+' | sort -u || true)

if [ -n "$issues" ]; then
  for n in $issues; do
    echo "## Issue #$n"; echo
    gh issue view "$n" --json title,body --jq '"**" + .title + "**\n\n" + (.body // "")' \
      2>/dev/null || echo "(could not fetch issue #$n)"
    echo; echo "---"; echo
  done
else
  echo "No originating issue found in the PR body (no Closes/Fixes/Resolves #N)."
fi
