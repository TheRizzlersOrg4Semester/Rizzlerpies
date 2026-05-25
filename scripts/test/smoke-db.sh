#!/usr/bin/env bash

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:4000}"

endpoints=(
  "/readyz"
  "/"
  "/recipes/1/"
  "/api/recipe/recipes/"
  "/api/recipe/ingredients/"
  "/api/recipe/tags/"
)

printf '[smoke-db] Using BASE_URL=%s\n' "${BASE_URL}"

for endpoint in "${endpoints[@]}"; do
  url="${BASE_URL%/}${endpoint}"
  printf '[smoke-db] Checking %s\n' "${url}"
  curl --fail --silent --show-error --output /dev/null "${url}"
done

printf '[smoke-db] All database-backed smoke checks passed.\n'
