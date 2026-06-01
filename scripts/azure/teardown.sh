#!/usr/bin/env bash

set -euo pipefail

RESOURCE_GROUP="${RESOURCE_GROUP:-${AZURE_RESOURCE_GROUP:-rizzlerpies-rg}}"
AUTO_CONFIRM="${AUTO_CONFIRM:-false}"

fail() {
  printf '[teardown] %s\n' "$1" >&2
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

require_cmd az

if ! az account show >/dev/null 2>&1; then
  fail "Azure CLI is not logged in. Run az login first."
fi

if ! az group exists --name "${RESOURCE_GROUP}" | grep -q "true"; then
  printf '[teardown] Resource group %s does not exist. Nothing to delete.\n' "${RESOURCE_GROUP}"
  exit 0
fi

if [[ "${AUTO_CONFIRM}" != "true" ]]; then
  printf '[teardown] About to delete resource group %s.\n' "${RESOURCE_GROUP}"
  read -r -p "Type the resource group name to confirm: " reply
  [[ "${reply}" == "${RESOURCE_GROUP}" ]] || fail "Confirmation did not match. Aborting."
fi

az group delete --name "${RESOURCE_GROUP}" --yes --no-wait

cat <<EOF
[teardown] Deletion started for resource group ${RESOURCE_GROUP}.
[teardown] Check progress with:
  az group exists --name ${RESOURCE_GROUP}
  az group wait --deleted --name ${RESOURCE_GROUP}
EOF
