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

DEFAULT_ENV_FILE="${APP_DIR}/shared/production.env"
if [[ ! -f "${DEFAULT_ENV_FILE}" && -f "${APP_DIR}/../shared/production.env" ]]; then
  DEFAULT_ENV_FILE="${APP_DIR}/../shared/production.env"
fi

DEPLOY_ENV_FILE="${DEPLOY_ENV_FILE:-${DEFAULT_ENV_FILE}}"
if [[ -f "${DEPLOY_ENV_FILE}" ]]; then
  log "Loading deployment environment from ${DEPLOY_ENV_FILE}."
  set -a
  # shellcheck disable=SC1090
  source "${DEPLOY_ENV_FILE}"
  set +a
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  fail "DATABASE_URL is required for PostgreSQL deployment. Set it in the app VM deployment environment."
fi

log "DATABASE_URL is set; value is hidden."

log "Validating docker compose configuration."
docker compose -f docker-compose.yml config >/dev/null

log "Building app image for schema migration."
docker compose -f docker-compose.yml build app-a

log "Running PostgreSQL schema migrations."
if ! docker compose -f docker-compose.yml run --rm --no-deps app-a npm run db:migrate; then
  fail "PostgreSQL schema migration failed. Aborting deployment."
fi

log "Starting application stack."
docker compose -f docker-compose.yml up -d --build --remove-orphans --no-deps app-a app-b proxy

log "Waiting for readiness endpoint ${HEALTHCHECK_URL}."
for _ in $(seq 1 30); do
  if curl -kfsS "${HEALTHCHECK_URL}" >/dev/null; then
    log "Deployment succeeded."
    exit 0
  fi
  sleep 2
done

log "Deployment failed health checks. Printing compose logs."
docker compose -f docker-compose.yml logs --no-color
fail "Application did not become ready in time."
