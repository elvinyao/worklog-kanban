#!/usr/bin/env bash
# Host-side Docker orchestration only. Project code and Git run in containers.
set -euo pipefail
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT="${WORKLOG_PROJECT:-worklog-kanban}"
if [ "${1:-}" = --project ]; then
  [ "$#" -ge 3 ] || { echo 'Usage: bash docker.sh --project NAME ACTION' >&2; exit 64; }
  PROJECT="$2"
  shift 2
fi
[[ "$PROJECT" =~ ^[a-z0-9][a-z0-9_-]{0,50}$ ]] || { echo 'Invalid project name.' >&2; exit 64; }
ACTION="${1:-start}"
if [ "$#" -gt 0 ]; then shift; fi
usage() {
  echo 'Usage: bash docker.sh start | update [--local] | stop | remove [--purge-data --yes] | status | logs'
  echo 'start: build if needed, start all 3 services, export extension'
  echo 'update: fetch and fast-forward Git safely, build and replace; --local skips Git'
  echo 'stop/remove keep shared data; --purge-data --yes permanently deletes this project data'
}
bad_args() { usage >&2; exit 64; }
LOCAL=false
PURGE=false
case "$ACTION" in
  help|--help|-h) [ "$#" -eq 0 ] || bad_args; usage; exit 0 ;;
  start|stop|status|logs|config) [ "$#" -eq 0 ] || bad_args ;;
  update) if [ "$#" -eq 1 ] && [ "$1" = --local ]; then LOCAL=true; elif [ "$#" -ne 0 ]; then bad_args; fi ;;
  remove) if [ "$#" -eq 2 ] && [ "$1" = --purge-data ] && [ "$2" = --yes ]; then PURGE=true; elif [ "$#" -ne 0 ]; then bad_args; fi ;;
  exec) [ "$#" -ge 2 ] || bad_args; case "$1" in board|jira|mattermost) ;; *) bad_args ;; esac ;;
  *) bad_args ;;
esac
IMAGE="${PROJECT}:local"
CANDIDATE="${PROJECT}:candidate"
load_images() {
  while IFS='=' read -r key value; do
    case "$key" in PYTHON_IMAGE) PYTHON_IMAGE="$value" ;; NODE_IMAGE) NODE_IMAGE="$value" ;; esac
  done < "$ROOT/.agent/images.lock"
  case "${PYTHON_IMAGE:-}" in python@sha256:*) ;; *) echo 'Invalid Python image lock.' >&2; return 1 ;; esac
  case "${NODE_IMAGE:-}" in node@sha256:*) ;; *) echo 'Invalid Node image lock.' >&2; return 1 ;; esac
}
command -v docker >/dev/null 2>&1 || { echo 'Please install/start Docker Desktop or OrbStack.' >&2; exit 127; }
docker info --format '{{.ServerVersion}}' >/dev/null || { echo 'Docker is not available; no host fallback.' >&2; exit 125; }
docker compose version >/dev/null || { echo 'Docker Compose v2 with --wait is required.' >&2; exit 125; }
load_images
COMPOSE=(docker compose --project-directory "$ROOT" --env-file "$ROOT/.agent/images.lock" --project-name "$PROJECT" -f "$ROOT/compose.yaml")
SNAPSHOT="$ROOT/.tmp/docker-state/$PROJECT/compose.json"
if [ -f "$SNAPSHOT" ]; then
  case "$ACTION" in
    start)
      if docker image inspect "$IMAGE" >/dev/null 2>&1; then
        COMPOSE=(docker compose --project-directory "$ROOT" --project-name "$PROJECT" -f "$SNAPSHOT")
      fi ;;
    stop|remove|status|logs|exec) COMPOSE=(docker compose --project-directory "$ROOT" --project-name "$PROJECT" -f "$SNAPSHOT") ;;
  esac
fi
compose() { WORKLOG_IMAGE="$IMAGE" "${COMPOSE[@]}" "$@"; }
if [ "$ACTION" = status ]; then compose ps -a; echo "Data volume: ${PROJECT}_board-data"; exit; fi
if [ "$ACTION" = logs ]; then compose logs --tail=100 --follow; exit; fi
if [ "$ACTION" = config ]; then compose config; exit; fi
if [ "$ACTION" = exec ]; then compose exec -T "$@"; exit; fi

# Atomic Docker object creation serializes mutations without executing host tools.
LOCK=""
LOCK_IMAGE="$IMAGE"
if ! docker image inspect "$LOCK_IMAGE" >/dev/null 2>&1; then
  LOCK_CONTAINER="$(compose ps -a -q board)"
  if [ -n "$LOCK_CONTAINER" ]; then
    LOCK_IMAGE="$(docker inspect --format '{{.Image}}' "$LOCK_CONTAINER")"
  else
    LOCK_IMAGE="$PYTHON_IMAGE"
  fi
fi
if ! LOCK="$(docker create --name "${PROJECT}-operation-lock" --label worklog.operation-lock=true "$LOCK_IMAGE" /bin/true)"; then
  echo "Cannot acquire operation lock. If another operation is active, wait for it. Stale lock name: ${PROJECT}-operation-lock" >&2
  exit 1
fi
release_lock() { if [ -n "$LOCK" ]; then docker rm "$LOCK" >/dev/null; LOCK=""; fi; }
trap release_lock EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

export_extension() {
  docker run --rm -i --init --network none --read-only --tmpfs /tmp --user 0:0 \
    -v "$ROOT:/workspace" -w /workspace --entrypoint python "$IMAGE" \
    /opt/worklog/docker/as_owner.py python /opt/worklog/docker/export_extension.py
}
save_state() {
  compose config --format json | docker run --rm -i --init --network none --read-only --tmpfs /tmp --user 0:0 \
    -v "$ROOT:/workspace" -w /workspace --entrypoint python "$IMAGE" \
    /opt/worklog/docker/as_owner.py python /opt/worklog/docker/save_state.py "$PROJECT"
}
rollback() {
  if [ -n "$OLD_IMAGE" ]; then
    echo 'Replacement failed; restoring the previous image with the same data volume.' >&2
    docker tag "$OLD_IMAGE" "$IMAGE" || return 1
    if [ -f "$SNAPSHOT" ]; then
      COMPOSE=(docker compose --project-directory "$ROOT" --project-name "$PROJECT" -f "$SNAPSHOT")
    fi
    compose up -d --no-build --pull never --force-recreate --wait --wait-timeout 60 || return 1
    if [ "$OLD_RUNNING" != true ]; then compose stop || return 1; fi
    export_extension || return 1
    echo 'Previous image restored.' >&2
  else
    echo 'Startup failed. Inspect bash docker.sh logs; shared data was not deleted.' >&2
  fi
}
deploy() {
  local rebuild="$1" container
  OLD_IMAGE=""; OLD_RUNNING=false
  container="$(compose ps -a -q board)" || return 1
  if [ -n "$container" ]; then
    OLD_IMAGE="$(docker inspect --format '{{.Image}}' "$container")" || return 1
    OLD_RUNNING="$(docker inspect --format '{{.State.Running}}' "$container")" || return 1
  elif [ -f "$SNAPSHOT" ]; then
    OLD_IMAGE="$(docker image inspect --format '{{.Id}}' "$IMAGE" 2>/dev/null)" || OLD_IMAGE=""
  fi
  if [ "$rebuild" = true ] || ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
    echo 'Building the application in Docker. First run downloads locked dependencies.'
    WORKLOG_IMAGE="$CANDIDATE" "${COMPOSE[@]}" build board || return 1
    docker run --rm -i --init --network none --read-only --tmpfs /tmp \
      -v "$ROOT:/workspace:ro" -w /workspace --entrypoint python "$CANDIDATE" /opt/worklog/docker/preflight.py || return 1
    docker tag "$CANDIDATE" "$IMAGE" || return 1
  fi
  if ! compose up -d --no-build --pull never --wait --wait-timeout 60; then
    rollback || echo 'Automatic restore also failed; inspect logs. The data volume is retained.' >&2
    return 1
  fi
  if ! export_extension || ! save_state; then
    rollback || echo 'Automatic restore also failed; inspect logs. The data volume is retained.' >&2
    return 1
  fi
  echo 'Ready: http://board.localhost:4173/'
  echo 'Jira login: http://jira.localhost:4180/jira/__dummy/'
  echo 'Mattermost login: http://mattermost.localhost:4181/__dummy/'
  echo "Load/reload browser extension: $ROOT/dist/extension-docker"
  echo "Shared data: ${PROJECT}_board-data (preserved by stop/remove/update)"
}
case "$ACTION" in
  start) deploy false ;;
  update)
    if [ "$LOCAL" = false ]; then
      docker build --target source-tools --build-arg "PYTHON_IMAGE=$PYTHON_IMAGE" --build-arg "NODE_IMAGE=$NODE_IMAGE" -t "${PROJECT}:source-tools" -f "$ROOT/Dockerfile" "$ROOT"
      docker run --rm -i --init -v "$ROOT:/workspace" -w /workspace "${PROJECT}:source-tools"
      load_images
    fi
    deploy true ;;
  stop) compose stop; echo 'Stopped. Containers and shared data are retained.' ;;
  remove)
    if [ "$PURGE" = true ]; then
      compose down --volumes
      echo "Removed containers/network and deleted ${PROJECT}_board-data. Source files and other projects are untouched."
    else
      compose down
      echo "Removed containers/network. Shared data remains in ${PROJECT}_board-data."
    fi ;;
esac
