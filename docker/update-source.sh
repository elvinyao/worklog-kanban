#!/usr/bin/env bash
# Runs only inside the source-tools container (or disposable test repositories).
set -euo pipefail
export GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=safe.directory GIT_CONFIG_VALUE_0="$(pwd)"
export GIT_TERMINAL_PROMPT=0
if [ -n "$(git status --porcelain)" ]; then
  echo 'Update stopped: uncommitted or untracked changes exist. Commit or move them first; nothing was overwritten.' >&2
  exit 1
fi
if ! git symbolic-ref --quiet HEAD >/dev/null; then
  echo 'Update stopped: detached HEAD. Select a tracking branch first.' >&2
  exit 1
fi
if ! git rev-parse --verify '@{upstream}' >/dev/null 2>&1; then
  echo 'Update stopped: the current branch has no upstream.' >&2
  exit 1
fi
git fetch
git merge --ff-only --no-autostash --no-overwrite-ignore '@{upstream}'
