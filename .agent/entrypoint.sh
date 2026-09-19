#!/usr/bin/env bash
set -euo pipefail

if [ ! -x /opt/venv/bin/python ]; then
  /usr/local/bin/python -m venv /opt/venv
fi

python - <<'PY'
import os
from pathlib import Path

lock = Path('/workspace/.agent/images.lock')
if not lock.exists():
    refs = {name: os.environ[f'WORKLOG_{name}'] for name in ('PYTHON_IMAGE', 'NODE_IMAGE')}
    with lock.open('x') as target:
        for name, ref in refs.items():
            target.write(f'{name}={ref}\n')
PY

# The bind mount may be owned by a different UID on Docker Desktop.
export GIT_CONFIG_COUNT=1
export GIT_CONFIG_KEY_0=safe.directory
export GIT_CONFIG_VALUE_0=/workspace

# Installation commands must remain usable when a lock changed. All other
# project commands refuse to silently use dependencies from an older lock.
CHECK_LOCKS=1
case "${1:-}:${2:-}:${3:-}" in
  python:--version:*|node:--version:*|git:*|python:-m:pip|python:-m:piptools|python:-m:tools.sync_deps|npm:install:*|npm:ci:*|npm:install-scripts:*) CHECK_LOCKS=0 ;;
esac
if [ "$CHECK_LOCKS" -eq 1 ] && [ -f /workspace/requirements/dev.txt ] && [ -f /workspace/package-lock.json ]; then
  python -m tools.sync_deps --check
fi
exec "$@"
