#!/usr/bin/env bash
# Host work is limited to Docker orchestration. All project commands run inside.
set -euo pipefail

PROJECT_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
PYTHON_IMAGE="python:3.13.15-bookworm"
NODE_IMAGE="node:24.21.0-bookworm"
DEV_IMAGE="worklog-kanban-dev:python3.13.15-node24.21.0"

if ! command -v docker >/dev/null 2>&1; then
  echo 'Docker CLI is unavailable. Install/start Docker; host execution is disabled.' >&2
  exit 127
fi
if ! docker info --format '{{.ServerVersion}}' >/dev/null; then
  echo 'Docker daemon is unavailable or inaccessible. Start Docker and retry this runner.' >&2
  exit 125
fi
if [ "$#" -eq 0 ]; then
  echo 'Usage: bash .agent/run.sh <command> [args...]' >&2
  exit 64
fi

# This file is data, never sourced as executable shell code.
if [ -f "${PROJECT_ROOT}/.agent/images.lock" ]; then
  while IFS='=' read -r image_key image_ref; do
    case "$image_key" in
      PYTHON_IMAGE) PYTHON_IMAGE="$image_ref" ;;
      NODE_IMAGE) NODE_IMAGE="$image_ref" ;;
    esac
  done < "${PROJECT_ROOT}/.agent/images.lock"
else
  docker pull "$PYTHON_IMAGE"
  docker pull "$NODE_IMAGE"
  PYTHON_IMAGE="$(docker image inspect "$PYTHON_IMAGE" --format '{{index .RepoDigests 0}}')"
  NODE_IMAGE="$(docker image inspect "$NODE_IMAGE" --format '{{index .RepoDigests 0}}')"
fi

case "$PYTHON_IMAGE" in python@sha256:*) ;; *) echo 'Invalid Python image lock.' >&2; exit 65 ;; esac
case "$NODE_IMAGE" in node@sha256:*) ;; *) echo 'Invalid Node image lock.' >&2; exit 65 ;; esac

docker build --quiet \
  --build-arg "PYTHON_IMAGE=$PYTHON_IMAGE" \
  --build-arg "NODE_IMAGE=$NODE_IMAGE" \
  -t "$DEV_IMAGE" "${PROJECT_ROOT}/.agent"

DOCKER_ARGS=(run --rm -i --init)
if [ "$1" = python ] && { [ "${2:-}" = dist/production/run.py ] || { [ "${2:-}" = -m ] && [ "${3:-}" = tools.dev ]; }; }; then
  DOCKER_ARGS+=(-p 127.0.0.1:4173:4173)
  if [ "${3:-}" = tools.dev ]; then
    DOCKER_ARGS+=(-p 127.0.0.1:4180:4180 -p 127.0.0.1:4181:4181)
  fi
fi

PYTHON_KEY="${PYTHON_IMAGE##*:}"
NODE_KEY="${NODE_IMAGE##*:}"
exec docker "${DOCKER_ARGS[@]}" \
  -v "${PROJECT_ROOT}:/workspace" \
  -v "worklog-kanban-python-${PYTHON_KEY:0:12}:/opt/venv" \
  -v "worklog-kanban-node-${NODE_KEY:0:12}:/workspace/node_modules" \
  -v worklog-kanban-pip-cache:/root/.cache/pip \
  -v worklog-kanban-npm-cache:/root/.npm \
  -v worklog-kanban-browsers:/root/.cache/ms-playwright \
  -e "WORKLOG_PYTHON_IMAGE=$PYTHON_IMAGE" \
  -e "WORKLOG_NODE_IMAGE=$NODE_IMAGE" \
  -w /workspace "$DEV_IMAGE" "$@"
