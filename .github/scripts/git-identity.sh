#!/usr/bin/env bash
set -euo pipefail

# Configure the bot git identity used by every workflow that commits or pushes
# as the App (address-review.yml, implement.yml, autofix.yml, rebase.yml).
git config user.name "smonn[bot]"
git config user.email "110314539+smonn[bot]@users.noreply.github.com"
