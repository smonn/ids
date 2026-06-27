#!/usr/bin/env bash
# Phase 2 of the namespaced label taxonomy (ADR-0029): dual-write the namespaced
# issue:/pr: lifecycle STATUS alongside the flat pipeline labels, so the namespaced
# set is populated before Phase 3 flips any trigger onto it. Sourced by
# triage/implement/unblock (issue: side) and review/address-review (pr: side).
#
# These are STATUS labels (ADR-0030): descriptive, single-select by convention,
# and absent from every workflow's `labeled` filter — so writing them triggers no
# pipeline work. The flat labels remain authoritative through the transition; these
# are mirrors. Every write is best-effort (`|| true`): a status label failing to
# land must never fail the job, because nothing reads it yet.
#
# Single-select is enforced the way the ADR describes — the owning workflow removes
# the other values of the namespace when it sets one. set_issue_status /
# set_pr_status read the current labels once and remove only the sibling values
# actually present, so the whole transition is one read + one edit.

# The namespaced lifecycle value sets (single-select per object).
ISSUE_STATUS_LABELS="issue:triage issue:needs-info issue:ready-agent issue:ready-human issue:in-progress issue:blocked issue:wontfix"
PR_STATUS_LABELS="pr:reviewing pr:changes-requested pr:addressing-feedback pr:ready pr:outdated"

# Map a flat issue lifecycle label to its namespaced issue: equivalent (ADR-0029).
# Echoes nothing for a flat label with no issue: counterpart.
ns_issue_status() {
  case "$1" in
    needs-triage) echo "issue:triage" ;;
    needs-info) echo "issue:needs-info" ;;
    ready-for-agent) echo "issue:ready-agent" ;;
    ready-for-human) echo "issue:ready-human" ;;
    in-progress) echo "issue:in-progress" ;;
    blocked) echo "issue:blocked" ;;
    wontfix) echo "issue:wontfix" ;;
  esac
}

# Set the single-select issue: status on an issue to mirror a flat decision.
# Usage: set_issue_status <issue-number> <flat-label>
# Adds the namespaced equivalent of <flat-label> and removes every other issue:
# value currently present. No-op if <flat-label> has no mapping.
set_issue_status() {
  local issue="$1" flat="$2" want present other
  want=$(ns_issue_status "$flat")
  [ -n "$want" ] || return 0
  local args=(--add-label "$want")
  present=$(gh issue view "$issue" --json labels --jq '.labels[].name' 2>/dev/null || true)
  for other in $ISSUE_STATUS_LABELS; do
    [ "$other" = "$want" ] && continue
    printf '%s\n' "$present" | grep -qxF -- "$other" && args+=(--remove-label "$other")
  done
  gh issue edit "$issue" "${args[@]}" >/dev/null 2>&1 || true
}

# Set the single-select pr: status on a PR.
# Usage: set_pr_status <pr-number> <pr:value>
# Adds <pr:value> and removes every other pr: value currently present.
set_pr_status() {
  local pr="$1" want="$2" present other
  [ -n "$want" ] || return 0
  local args=(--add-label "$want")
  present=$(gh pr view "$pr" --json labels --jq '.labels[].name' 2>/dev/null || true)
  for other in $PR_STATUS_LABELS; do
    [ "$other" = "$want" ] && continue
    printf '%s\n' "$present" | grep -qxF -- "$other" && args+=(--remove-label "$other")
  done
  gh pr edit "$pr" "${args[@]}" >/dev/null 2>&1 || true
}
