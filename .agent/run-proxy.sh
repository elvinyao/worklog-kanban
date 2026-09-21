#!/usr/bin/env bash
# Same command interface as run.sh; host proxy + exported PEM CA are required.
set -euo pipefail
export WORKLOG_DEBUG_NETWORK=proxy
exec bash "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/run.sh" "$@"
