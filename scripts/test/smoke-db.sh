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

check_url() {
  local url="$1"

  if command -v curl >/dev/null 2>&1; then
    curl --fail --silent --show-error --output /dev/null "${url}"
    return
  fi

  if command -v node >/dev/null 2>&1; then
    URL="${url}" node -e '
const url = process.env.URL;

fetch(url)
  .then((response) => {
    if (!response.ok) {
      console.error(`${url} returned HTTP ${response.status}`);
      process.exit(1);
    }
  })
  .catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
'
    return
  fi

  printf '[smoke-db] Missing curl or node; cannot check %s\n' "${url}" >&2
  return 127
}

for endpoint in "${endpoints[@]}"; do
  url="${BASE_URL%/}${endpoint}"
  printf '[smoke-db] Checking %s\n' "${url}"
  check_url "${url}"
done

printf '[smoke-db] All database-backed smoke checks passed.\n'
