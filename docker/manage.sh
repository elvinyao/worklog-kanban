#!/usr/bin/env bash
# Host-side Docker orchestration only; helpers and Git execute in containers.
set -euo pipefail
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT="${WORKLOG_PROJECT:-worklog-kanban}"
usage() {
  echo 'Usage: bash docker.sh [--project NAME] ACTION'
  echo 'start | update [--local] [--config config/company.local.json] [--port PORT] [--trusted-proxy CIDR]'
  echo 'stop | remove [--purge-data --yes] | status | logs | config | doctor | backup | backups'
  echo 'restore BACKUP_ID --yes: replace shared data; retain a copy of the pre-restore data'
  echo 'Without --config, first start uses dummy. Later commands reuse the successful deployment.'
  echo 'stop/remove retain shared data; --purge-data --yes permanently deletes it.'
}
bad_args() { usage >&2; exit 64; }
if [ "${1:-}" = --project ]; then [ "$#" -ge 3 ] || bad_args; PROJECT="$2"; shift 2; fi
[[ "$PROJECT" =~ ^[a-z0-9][a-z0-9_-]{0,50}$ ]] || bad_args
ACTION="${1:-start}"
if [ "$#" -gt 0 ]; then shift; fi
LOCAL=false; PURGE=false; RECONFIGURE=false; CONFIG_ARGS=()
case "$ACTION" in
  help|--help|-h) [ "$#" -eq 0 ] || bad_args; usage; exit 0 ;;
  start|update)
    while [ "$#" -gt 0 ]; do
      case "$1" in
        --local) [ "$ACTION" = update ] || bad_args; LOCAL=true; shift ;;
        --config|--port|--trusted-proxy)
          [ "$#" -ge 2 ] && [ -n "$2" ] || bad_args
          CONFIG_ARGS+=("$1" "$2"); RECONFIGURE=true; shift 2 ;;
        *) bad_args ;;
      esac
    done ;;
  stop|status|logs|config|doctor|backup|backups) [ "$#" -eq 0 ] || bad_args ;;
  restore) [ "$#" -eq 2 ] && [ "$2" = --yes ] || bad_args; BACKUP_ID="$1"; [[ "$BACKUP_ID" =~ ^[0-9]{8}T[0-9]{6}Z-[a-f0-9]{8}$ ]] || bad_args ;;
  remove) if [ "$#" -eq 2 ] && [ "$1" = --purge-data ] && [ "$2" = --yes ]; then PURGE=true; elif [ "$#" -ne 0 ]; then bad_args; fi ;;
  exec) [ "$#" -ge 2 ] || bad_args; case "$1" in board|jira|mattermost) ;; *) bad_args ;; esac ;;
  *) bad_args ;;
esac
command -v docker >/dev/null 2>&1 || { echo 'Start/install Docker Desktop or OrbStack.' >&2; exit 127; }
docker info --format '{{.ServerVersion}}' >/dev/null || { echo 'Docker is not running or accessible.' >&2; exit 125; }
docker compose version >/dev/null || { echo 'Docker Compose v2 with --wait is required.' >&2; exit 125; }
load_images() {
  while IFS='=' read -r key value; do
    case "$key" in PYTHON_IMAGE) PYTHON_IMAGE="$value" ;; NODE_IMAGE) NODE_IMAGE="$value" ;; esac
  done < "$ROOT/.agent/images.lock"
  case "${PYTHON_IMAGE:-}" in python@sha256:*) ;; *) echo 'Invalid Python image lock.' >&2; return 1 ;; esac
  case "${NODE_IMAGE:-}" in node@sha256:*) ;; *) echo 'Invalid Node image lock.' >&2; return 1 ;; esac
}
load_images
IMAGE="${PROJECT}:local"; CANDIDATE="${PROJECT}:candidate"; OPS="${PROJECT}:operations"
STATE_DIR="$ROOT/.tmp/docker-state/$PROJECT"
SNAPSHOT="$STATE_DIR/compose.json"
COMPOSE_FILE="$ROOT/deploy/fake/compose.yaml"
if [ -f "$SNAPSHOT" ]; then COMPOSE_FILE="$SNAPSHOT"; fi
compose() { WORKLOG_IMAGE="$IMAGE" docker compose --project-directory "$ROOT" --env-file "$ROOT/.agent/images.lock" --project-name "$PROJECT" -f "$COMPOSE_FILE" "$@"; }
if [ "$ACTION" = status ]; then compose ps -a; echo "Data volume: ${PROJECT}_board-data"; exit; fi
if [ "$ACTION" = logs ]; then compose logs --tail=100 --follow; exit; fi
if [ "$ACTION" = config ]; then compose config; exit; fi
if [ "$ACTION" = exec ]; then compose exec -T "$@"; exit; fi
if [ "$ACTION" = doctor ]; then
  echo '[OK] Docker and Compose are available.'
  compose ps -a
  service_states="$(compose ps -a --format json)"
  container="$(compose ps -a -q board)"; running=false; runtime_image=""; sites=null
  container_state='{"status":"removed","exitCode":0,"oomKilled":false}'
  NETWORK_ARGS=(--network none); DATA_ARGS=(--tmpfs /data:ro)
  if [ -n "$container" ]; then
    running="$(docker inspect --format '{{.State.Running}}' "$container")"
    runtime_image="$(docker inspect --format '{{.Image}}' "$container")"
    container_state="$(docker inspect --format '{"status":"{{.State.Status}}","exitCode":{{.State.ExitCode}},"oomKilled":{{.State.OOMKilled}}}' "$container")"
    if [ "$running" = true ]; then NETWORK_ARGS=(--network "container:$container"); fi
  else runtime_image="$(docker image inspect --format '{{.Id}}' "$IMAGE" 2>/dev/null)" || runtime_image=""; fi
  if [ -n "$runtime_image" ]; then
    sites="$(docker run --pull never --rm -i --init --network none --read-only --tmpfs /tmp --entrypoint python "$runtime_image" -c 'import json,os; from pathlib import Path; print(json.dumps(json.loads(Path(os.environ.get("WORKLOG_SITE_CONFIG","/opt/worklog/config/dummy.json")).read_text())))')" || sites=null
  fi
  if docker volume inspect "${PROJECT}_board-data" >/dev/null 2>&1; then DATA_ARGS=(-v "${PROJECT}_board-data:/data:ro"); fi
  exec docker run --pull never --rm -i --init "${NETWORK_ARGS[@]}" --read-only --tmpfs /tmp "${DATA_ARGS[@]}" \
    -v "$ROOT:/workspace:ro" -w /workspace --entrypoint python "$PYTHON_IMAGE" \
    /workspace/docker/doctor.py --project "$PROJECT" --running "$running" --image-sites "$sites" --container-state "$container_state" --service-states "$service_states"
fi

LOCK=""
if ! LOCK="$(docker create --name "${PROJECT}-operation-lock" --label worklog.operation-lock=true "$PYTHON_IMAGE" /bin/true)"; then
  echo "Another operation may be running. Check ${PROJECT}-operation-lock before retrying." >&2; exit 1
fi
release_lock() { if [ -n "$LOCK" ]; then docker rm "$LOCK" >/dev/null; LOCK=""; fi; }
trap release_lock EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
build_ops() {
  docker build --quiet --target operations --build-arg "PYTHON_IMAGE=$PYTHON_IMAGE" --build-arg "NODE_IMAGE=$NODE_IMAGE" -t "$OPS" -f "$ROOT/docker/legacy.Dockerfile" "$ROOT" >/dev/null
}
settings() {
  docker run --rm -i --init --network none --read-only --tmpfs /tmp --user 0:0 -v "$ROOT:/workspace" -w /workspace --entrypoint python "$OPS" \
    /opt/worklog/docker/as_owner.py python /opt/worklog/docker/deployment.py "$@" --project "$PROJECT"
}
maintenance() {
  docker run --rm -i --init --network none --read-only --tmpfs /tmp --user 0:0 \
    -v "$ROOT:/workspace" -v "${PROJECT}_board-data:/data" -w /workspace --entrypoint python "$OPS" \
    /opt/worklog/docker/backup.py "$@" --project "$PROJECT"
}
export_extension() {
  docker run --rm -i --init --network none --read-only --tmpfs /tmp --user 0:0 -v "$ROOT:/workspace" -w /workspace --entrypoint python "$IMAGE" \
    /opt/worklog/docker/as_owner.py python /opt/worklog/docker/export_extension.py "$PROJECT"
}
rollback() {
  if [ -z "$OLD_IMAGE" ]; then
    if ! compose stop; then echo 'Candidate services could not be stopped; inspect status/logs.' >&2; fi
    echo 'No successful deployment to restore. Data retained. Retry start with the intended --config.' >&2
    return 1
  fi
  echo 'Restoring the previous image and deployment settings.' >&2
  docker tag "$OLD_IMAGE" "$IMAGE" || return 1
  if [ -f "$SNAPSHOT" ]; then COMPOSE_FILE="$SNAPSHOT"; fi
  if ! compose up -d --no-build --pull never --force-recreate --wait --wait-timeout 60; then
    echo 'Previous image cannot start. Data is retained; database versions may differ. Run doctor and consult the backup recovery instructions.' >&2; return 1
  fi
  if [ "$OLD_RUNNING" != true ]; then compose stop || return 1; fi
  export_extension
}
deploy() {
  local rebuild="$1" container mode
  OLD_IMAGE=""; OLD_RUNNING=false
  container="$(compose ps -a -q board)"
  if [ -f "$SNAPSHOT" ] && [ -n "$container" ]; then
    OLD_IMAGE="$(docker inspect --format '{{.Image}}' "$container")"
    OLD_RUNNING="$(docker inspect --format '{{.State.Running}}' "$container")"
  elif [ -f "$SNAPSHOT" ]; then OLD_IMAGE="$(docker image inspect --format '{{.Id}}' "$IMAGE" 2>/dev/null)" || OLD_IMAGE=""; fi
  build_ops
  # macOS Bash 3.2 treats an empty array as unset under nounset.
  mode="$(settings prepare ${CONFIG_ARGS[@]+"${CONFIG_ARGS[@]}"})"
  COMPOSE_FILE="$STATE_DIR/candidate.json"
  if [ "$rebuild" = true ] || [ "$RECONFIGURE" = true ] || [ ! -f "$SNAPSHOT" ] || ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
    echo "Building $mode deployment in Docker..."
    BUILD_ARGS=(--target app)
    if [ "$mode" = production ]; then BUILD_ARGS=(--target production --secret "id=site_config,src=$STATE_DIR/candidate-sites.json" --build-arg "SITE_CONFIG_DIGEST=$(settings fingerprint)"); fi
    docker build "${BUILD_ARGS[@]}" --build-arg "PYTHON_IMAGE=$PYTHON_IMAGE" --build-arg "NODE_IMAGE=$NODE_IMAGE" -t "$CANDIDATE" -f "$ROOT/docker/legacy.Dockerfile" "$ROOT" || return 1
    docker run --rm -i --init --network none --read-only --tmpfs /tmp --entrypoint python "$CANDIDATE" /opt/worklog/docker/preflight.py || return 1
    docker tag "$CANDIDATE" "$IMAGE" || return 1
  fi
  if ! compose up -d --no-build --pull never --wait --wait-timeout 60; then rollback || true; return 1; fi
  if ! export_extension || ! settings promote; then rollback || true; return 1; fi
  settings summary
  if [ "$PROJECT" = worklog-kanban ]; then echo "Extension: $ROOT/dist/extension-docker"; else echo "Extension: $ROOT/dist/extensions/$PROJECT"; fi
  echo "Shared data: ${PROJECT}_board-data (preserved by stop/remove/update)"
}
case "$ACTION" in
  start) deploy false ;;
  update)
    if [ "$LOCAL" = false ]; then
      docker build --target source-tools --build-arg "PYTHON_IMAGE=$PYTHON_IMAGE" --build-arg "NODE_IMAGE=$NODE_IMAGE" -t "${PROJECT}:source-tools" -f "$ROOT/docker/legacy.Dockerfile" "$ROOT"
      docker run --rm -i --init -v "$ROOT:/workspace" -w /workspace "${PROJECT}:source-tools"
      load_images
    fi
    deploy true ;;
  stop) compose stop; echo 'Stopped; shared data is retained.' ;;
  backup|backups|restore)
    [ -f "$SNAPSHOT" ] || { echo 'No saved deployment for this project. Start it first.' >&2; exit 1; }
    if [ "$ACTION" != backups ]; then docker volume inspect "${PROJECT}_board-data" >/dev/null || { echo 'No data volume; nothing was created or restored.' >&2; exit 1; }; fi
    build_ops
    if [ "$ACTION" = backups ]; then
      docker run --rm -i --init --network none --read-only --tmpfs /tmp -v "$ROOT:/workspace:ro" --entrypoint python "$OPS" /opt/worklog/docker/backup.py backups --project "$PROJECT"
    else
      container="$(compose ps -a -q board)"; runtime_image=""; was_running=false
      if [ -n "$container" ]; then runtime_image="$(docker inspect --format '{{.Image}}' "$container")"; was_running="$(docker inspect --format '{{.State.Running}}' "$container")"; fi
      if [ "$ACTION" = backup ]; then
        identifier="$(maintenance backup --image "$runtime_image")"
        echo "Backup saved: $ROOT/backups/$PROJECT/$identifier"
      else
        stage="$(maintenance stage --id "$BACKUP_ID")"
        if [ "$was_running" = true ]; then compose stop board; fi
        if ! maintenance apply --id "$stage" --image "$runtime_image"; then
          echo 'Restore failed. Retained data and backups were not purged. Run doctor before retrying.' >&2
          if [ "$was_running" = true ]; then compose up -d --no-build --pull never --wait --wait-timeout 60 board || true; fi
          exit 1
        fi
        if [ "$was_running" = true ]; then
          if ! compose up -d --no-build --pull never --wait --wait-timeout 60 board; then
            compose stop board || true
            echo 'Restored database could not start. The pre-restore backup is retained; inspect doctor and backups.' >&2; exit 1
          fi
        fi
        echo 'Restored. Previous running/stopped state retained. Reload all open board tabs.'
      fi
    fi ;;
  remove)
    if [ "$PURGE" = true ]; then compose down --volumes; echo "Removed services and permanently deleted ${PROJECT}_board-data. External backups remain.";
    else compose down; echo "Removed services; ${PROJECT}_board-data is retained."; fi ;;
esac
