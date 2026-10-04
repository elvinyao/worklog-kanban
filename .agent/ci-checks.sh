#!/usr/bin/env bash
# The CI image already contains the source, locked dependencies and browsers.
set -euo pipefail
mkdir -p /workspace/.tmp/ci-results
exec > >(tee /workspace/.tmp/ci-results/checks.log) 2>&1
export WORKLOG_TEST_REPORTS=/workspace/.tmp/ci-results

npm run check
npm run test:unit -- --reporter=default --reporter=junit --outputFile=/workspace/.tmp/ci-results/unit.xml
npm run build
python -m pytest tests/backend -q --junitxml=/workspace/.tmp/ci-results/backend.xml
npm run test:e2e
