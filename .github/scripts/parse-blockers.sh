#!/usr/bin/env bash
set -euo pipefail

# Parse declared blocker issue numbers from issue/PR text read on STDIN and write
# the de-duplicated numbers (one per line, `sort -un`) to STDOUT. Pure text
# processing — NO gh, NO network. Shared verbatim by unblock.yml and triage.yml.
#
# Two declaration forms are recognised:
#   1. an inline phrase + number on one line ("Depends on #104"); and
#   2. a "## Blocked by" (or Depends on / Requires) heading followed by a
#      markdown bullet list of "- #N" items — the issue-template form, which a
#      line-by-line grep misses because the number sits on its own bullet line.
# The bullet pass reads only the LEADING #N of each bullet under the heading
# (not surrounding prose), so a self-reference like "Issue #109 depends on
# #104" resolves to #104, never #109.

text=$(cat)

{
  printf '%s' "$text" \
    | grep -oiE '(blocked by|depends on|requires)[[:space:]]*:?[[:space:]]*#[0-9]+' \
    | grep -oE '[0-9]+'
  printf '%s' "$text" | awk '
    { lc = tolower($0) }
    lc ~ /blocked by|depends on|requires/ { collect = 1; started = 0; next }
    collect {
      if ($0 ~ /^[ \t]*$/) { if (started) collect = 0; next }
      if ($0 ~ /^[ \t]*[-*][ \t]*#?[0-9]+/) {
        n = $0
        sub(/^[ \t]*[-*][ \t]*#?/, "", n)
        sub(/[^0-9].*$/, "", n)
        print n
        started = 1
        next
      }
      collect = 0
    }
  '
} | sort -un || true
