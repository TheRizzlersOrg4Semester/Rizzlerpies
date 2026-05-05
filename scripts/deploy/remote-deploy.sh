#!/usr/bin/env bash

set -euo pipefail

APP_DIR="${1:-$(pwd)}"
HEALTHCHECK_URL="${HEALTHCHECK_URL:-https://127.0.0.1/readyz}"
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-rizzlerpies}"
export COMPOSE_PROJECT_NAME

log() {
  printf '[deploy] %s\n' "$1"
}

fail() {
  printf '[deploy] %s\n' "$1" >&2
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

require_cmd docker
require_cmd curl

cd "${APP_DIR}"

log "Validating docker compose configuration."
docker compose config >/dev/null

log "Starting application stack."
docker compose up -d --build --remove-orphans

log "Waiting for readiness endpoint ${HEALTHCHECK_URL}."
for _ in $(seq 1 30); do
  if curl -kfsS "${HEALTHCHECK_URL}" >/dev/null; then
    log "Deployment succeeded."
    exit 0
  fi
  sleep 2
done

log "Deployment failed health checks. Printing compose logs."
docker compose logs --no-color
fail "Application did not become ready in time."
