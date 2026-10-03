#!/usr/bin/env bash
# The CI image already contains the source, locked dependencies and browsers.
set -euo pipefail

npm run check
npm run test:unit
npm run build
python -m pytest tests/backend -q
npm run test:e2e
