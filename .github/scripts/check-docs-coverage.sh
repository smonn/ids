#!/usr/bin/env bash
# check-docs-coverage.sh — source→website-docs coverage mapping for PRs.
#
# The Starlight site under website/src/content/docs/ mirrors the source slices
# almost 1:1. This script maps each changed source file to the hand-written page
# that documents it and reports any change whose mapped page was NOT touched in
# the same PR — the gap that automation implementations tend to leave.
#
# The SCRIPT never exits non-zero on a gap (only on its own misuse): it emits
# the report and the `gaps` output. The WORKFLOW turns the report into a sticky
# PR comment and fails the check on gaps unless the PR body carries a
# `No docs update needed:` waiver line (see docs-coverage.yml).
#
# The TypeDoc API reference (website/api/**) is generated from source at build
# time, so it never drifts and is intentionally NOT mapped here — only the
# hand-written narrative pages do.
#
# Inputs (env):
#   CHANGED       newline-separated list of files changed in the PR (required)
#   REPORT_FILE   path to write the Markdown report to (required)
#   GITHUB_OUTPUT GitHub Actions step-output file (optional; receives `gaps=<n>`)
#
# The report file always starts with the `<!-- docs-coverage -->` marker so the
# poster can find a prior comment to update. The advisory body is appended only
# when there is at least one gap.

set -euo pipefail

: "${REPORT_FILE:?REPORT_FILE must be set}"

changed=$(printf '%s\n' "${CHANGED:-}" | sed '/^$/d')

# Map one changed source path to the website page that documents it, or print
# nothing if the path has no hand-written page (tests, internals, unmapped src).
doc_for() {
  case "$1" in
    *.test.ts) return ;; # tests never imply a doc change
    src/adapters/adapter-types.ts | src/adapters/test-helpers.ts) return ;;
    src/adapters/*.ts)
      name=${1#src/adapters/}
      name=${name%.ts}
      echo "website/src/content/docs/adapters/${name}.md"
      ;;
    src/codecs/_kernel/*) return ;; # shared internals, no narrative page
    src/codecs/*)
      rest=${1#src/codecs/}
      name=${rest%%/*}
      echo "website/src/content/docs/codecs/${name}.md"
      ;;
    src/cli/* | src/cli.ts | bin/*)
      echo "website/src/content/docs/cli.md"
      ;;
    src/error.ts)
      echo "website/src/content/docs/errors.md"
      ;;
  esac
}

# Collect, per expected doc page, the changed source files that imply it.
declare -A want
while IFS= read -r f; do
  [ -n "$f" ] || continue
  doc=$(doc_for "$f")
  [ -n "$doc" ] || continue
  # Only flag a page that actually exists; a missing page is a different gap and
  # would produce noise on brand-new, not-yet-documented slices.
  [ -f "$doc" ] || continue
  want["$doc"]="${want[$doc]:-}${f}"$'\n'
done <<<"$changed"

printf '%s\n' '<!-- docs-coverage -->' >"$REPORT_FILE"

gaps=0
rows=""
for doc in "${!want[@]}"; do
  # Touched in this PR? Then it's covered.
  if printf '%s\n' "$changed" | grep -qxF "$doc"; then
    continue
  fi
  gaps=$((gaps + 1))
  srcs=$(printf '%s' "${want[$doc]}" | sed '/^$/d; s/.*/`&`/' | paste -sd', ' -)
  rows="${rows}| ${srcs} | \`${doc}\` |"$'\n'
done

if [ "$gaps" -gt 0 ]; then
  {
    echo
    echo '### 📝 Website docs may be out of date'
    echo
    echo 'This PR changes source whose hand-written docs page was not updated in the same diff. The TypeDoc API reference regenerates itself, but these narrative pages do not — update them, or add a line starting `No docs update needed:` with the reason to the PR body to waive this check.'
    echo
    echo '| Changed source | Expected docs page |'
    echo '| --- | --- |'
    printf '%s' "$rows"
    echo
    echo '_This check fails until the page is updated or the waiver line is added. See `CONTRIBUTING.md` > Style for the source↔docs mapping._'
  } >>"$REPORT_FILE"
fi

if [ -n "${GITHUB_OUTPUT:-}" ]; then
  echo "gaps=$gaps" >>"$GITHUB_OUTPUT"
fi
echo "docs-coverage: $gaps gap(s)"
