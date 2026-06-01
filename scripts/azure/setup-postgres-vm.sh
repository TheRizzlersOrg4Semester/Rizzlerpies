#!/usr/bin/env bash

set -euo pipefail

RESOURCE_GROUP="${RESOURCE_GROUP:-${AZURE_RESOURCE_GROUP:-rizzlerpies-rg}}"
LOCATION="${LOCATION:-${AZURE_LOCATION:-northeurope}}"
APP_VM_NAME="${APP_VM_NAME:-${AZURE_VM_NAME:-rizzlerpies-vm}}"
DB_VM_NAME="${DB_VM_NAME:-${AZURE_DB_VM_NAME:-rizzlerpies-db-vm}}"
ADMIN_USERNAME="${ADMIN_USERNAME:-${AZURE_ADMIN_USERNAME:-azureuser}}"
VNET_NAME="${VNET_NAME:-}"
SUBNET_NAME="${SUBNET_NAME:-}"
DB_SIZE="${DB_SIZE:-Standard_B1s}"
POSTGRES_DB="${POSTGRES_DB:-rizzlerpies}"
POSTGRES_USER="${POSTGRES_USER:-rizzlerpies}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-change-me-before-running}"
SSH_PUBLIC_KEY_PATH="${SSH_PUBLIC_KEY_PATH:-${AZURE_SSH_PUBLIC_KEY:-$HOME/.ssh/id_ed25519.pub}}"
SSH_PRIVATE_KEY_PATH="${SSH_PUBLIC_KEY_PATH%.pub}"
DB_NSG_NAME="${DB_NSG_NAME:-${DB_VM_NAME}-nsg}"
DB_CONTAINER_NAME="${DB_CONTAINER_NAME:-rizzlerpies-postgres}"
DB_VOLUME_NAME="${DB_VOLUME_NAME:-postgres_data}"
ALLOW_APP_SUBNET="${ALLOW_APP_SUBNET:-false}"

log() {
  printf '[postgres-vm] %s\n' "$1"
}

fail() {
  printf '[postgres-vm] %s\n' "$1" >&2
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

require_cmd az
require_cmd awk
require_cmd grep
require_cmd ssh-keygen

shell_quote() {
  printf '%q' "$1"
}

if ! az account show >/dev/null 2>&1; then
  log "Azure CLI is not logged in. Starting az login."
  az login >/dev/null
fi

if [[ "${POSTGRES_PASSWORD}" == "change-me-before-running" ]]; then
  fail "Set POSTGRES_PASSWORD to a real secret in your shell before running this script."
fi

if [[ ! -f "${SSH_PUBLIC_KEY_PATH}" ]]; then
  log "SSH public key not found at ${SSH_PUBLIC_KEY_PATH}. Generating a new ed25519 keypair."
  mkdir -p "$(dirname "${SSH_PRIVATE_KEY_PATH}")"
  ssh-keygen -t ed25519 -f "${SSH_PRIVATE_KEY_PATH}" -N "" -C "${DB_VM_NAME}-admin"
fi

if ! az group exists --name "${RESOURCE_GROUP}" | grep -q "true"; then
  log "Creating resource group ${RESOURCE_GROUP} in ${LOCATION}."
  az group create --name "${RESOURCE_GROUP}" --location "${LOCATION}" >/dev/null
fi

if ! az vm show --resource-group "${RESOURCE_GROUP}" --name "${APP_VM_NAME}" >/dev/null 2>&1; then
  fail "App VM ${APP_VM_NAME} was not found in ${RESOURCE_GROUP}. Run scripts/azure/setup.sh first."
fi

APP_NIC_ID="$(az vm show \
  --resource-group "${RESOURCE_GROUP}" \
  --name "${APP_VM_NAME}" \
  --query "networkProfile.networkInterfaces[0].id" \
  --output tsv)"

APP_SUBNET_ID="$(az network nic show \
  --ids "${APP_NIC_ID}" \
  --query "ipConfigurations[0].subnet.id" \
  --output tsv)"

APP_PRIVATE_IP="$(az network nic show \
  --ids "${APP_NIC_ID}" \
  --query "ipConfigurations[0].privateIPAddress" \
  --output tsv)"

[[ -n "${APP_SUBNET_ID}" ]] || fail "Could not determine subnet for app VM ${APP_VM_NAME}."
[[ -n "${APP_PRIVATE_IP}" ]] || fail "Could not determine private IP for app VM ${APP_VM_NAME}."

if [[ -z "${VNET_NAME}" ]]; then
  VNET_NAME="$(printf '%s' "${APP_SUBNET_ID}" | awk -F'/' '{for (i=1; i<=NF; i++) if ($i=="virtualNetworks") print $(i+1)}')"
fi

if [[ -z "${SUBNET_NAME}" ]]; then
  SUBNET_NAME="$(printf '%s' "${APP_SUBNET_ID}" | awk -F'/' '{for (i=1; i<=NF; i++) if ($i=="subnets") print $(i+1)}')"
fi

[[ -n "${VNET_NAME}" ]] || fail "Could not determine VNET_NAME."
[[ -n "${SUBNET_NAME}" ]] || fail "Could not determine SUBNET_NAME."

APP_SUBNET_PREFIX="$(az network vnet subnet show \
  --resource-group "${RESOURCE_GROUP}" \
  --vnet-name "${VNET_NAME}" \
  --name "${SUBNET_NAME}" \
  --query "addressPrefix" \
  --output tsv)"

if [[ "${APP_SUBNET_PREFIX}" == "null" ]]; then
  APP_SUBNET_PREFIX=""
fi

if [[ -z "${APP_SUBNET_PREFIX}" ]]; then
  APP_SUBNET_PREFIX="$(az network vnet subnet show \
    --resource-group "${RESOURCE_GROUP}" \
    --vnet-name "${VNET_NAME}" \
    --name "${SUBNET_NAME}" \
    --query "addressPrefixes[0]" \
    --output tsv)"
fi

if [[ "${APP_SUBNET_PREFIX}" == "null" ]]; then
  APP_SUBNET_PREFIX=""
fi

[[ -n "${APP_SUBNET_PREFIX}" ]] || fail "Could not determine address prefix for subnet ${SUBNET_NAME}."

log "Using app VM ${APP_VM_NAME} private IP ${APP_PRIVATE_IP}."
log "Using VNet ${VNET_NAME} and subnet ${SUBNET_NAME}."

if ! az network nsg show --resource-group "${RESOURCE_GROUP}" --name "${DB_NSG_NAME}" >/dev/null 2>&1; then
  log "Creating database VM NSG ${DB_NSG_NAME}."
  az network nsg create \
    --resource-group "${RESOURCE_GROUP}" \
    --name "${DB_NSG_NAME}" \
    --location "${LOCATION}" \
    >/dev/null
else
  log "Database VM NSG ${DB_NSG_NAME} already exists and will be reused."
fi

DB_NSG_RESOURCE_ID="$(az network nsg show \
  --resource-group "${RESOURCE_GROUP}" \
  --name "${DB_NSG_NAME}" \
  --query "id" \
  --output tsv)"

if ! az vm show --resource-group "${RESOURCE_GROUP}" --name "${DB_VM_NAME}" >/dev/null 2>&1; then
  log "Creating database VM ${DB_VM_NAME} without a public IP."
  az vm create \
    --resource-group "${RESOURCE_GROUP}" \
    --name "${DB_VM_NAME}" \
    --image Ubuntu2204 \
    --size "${DB_SIZE}" \
    --admin-username "${ADMIN_USERNAME}" \
    --ssh-key-values "${SSH_PUBLIC_KEY_PATH}" \
    --vnet-name "${VNET_NAME}" \
    --subnet "${SUBNET_NAME}" \
    --nsg "${DB_NSG_NAME}" \
    --public-ip-address "" \
    >/dev/null
else
  log "Database VM ${DB_VM_NAME} already exists and will be reused."
fi

DB_NIC_ID="$(az vm show \
  --resource-group "${RESOURCE_GROUP}" \
  --name "${DB_VM_NAME}" \
  --query "networkProfile.networkInterfaces[0].id" \
  --output tsv)"

DB_NSG_ID="$(az network nic show \
  --ids "${DB_NIC_ID}" \
  --query "networkSecurityGroup.id" \
  --output tsv)"

if [[ -z "${DB_NSG_ID}" ]]; then
  log "Attaching NSG ${DB_NSG_NAME} to database VM NIC."
  az network nic update \
    --ids "${DB_NIC_ID}" \
    --network-security-group "${DB_NSG_RESOURCE_ID}" \
    >/dev/null
  DB_NSG_ID="$(az network nic show \
    --ids "${DB_NIC_ID}" \
    --query "networkSecurityGroup.id" \
    --output tsv)"
fi

DB_NSG_NAME="${DB_NSG_ID##*/}"
[[ -n "${DB_NSG_NAME}" ]] || fail "Could not determine NSG name for database VM ${DB_VM_NAME}."
SOURCE_PREFIX="${APP_PRIVATE_IP}/32"

if [[ "${ALLOW_APP_SUBNET}" == "true" ]]; then
  SOURCE_PREFIX="${APP_SUBNET_PREFIX}"
fi

if az network nsg rule show \
  --resource-group "${RESOURCE_GROUP}" \
  --nsg-name "${DB_NSG_NAME}" \
  --name AllowPostgresFromAppVm \
  >/dev/null 2>&1; then
  log "Updating NSG rule AllowPostgresFromAppVm to allow ${SOURCE_PREFIX}."
  az network nsg rule update \
    --resource-group "${RESOURCE_GROUP}" \
    --nsg-name "${DB_NSG_NAME}" \
    --name AllowPostgresFromAppVm \
    --source-address-prefixes "${SOURCE_PREFIX}" \
    --source-port-ranges "*" \
    --destination-address-prefixes "*" \
    --destination-port-ranges 5432 \
    --access Allow \
    --protocol Tcp \
    --direction Inbound \
    >/dev/null
else
  log "Creating NSG rule AllowPostgresFromAppVm for ${SOURCE_PREFIX}."
  az network nsg rule create \
    --resource-group "${RESOURCE_GROUP}" \
    --nsg-name "${DB_NSG_NAME}" \
    --name AllowPostgresFromAppVm \
    --priority 300 \
    --source-address-prefixes "${SOURCE_PREFIX}" \
    --source-port-ranges "*" \
    --destination-address-prefixes "*" \
    --destination-port-ranges 5432 \
    --access Allow \
    --protocol Tcp \
    --direction Inbound \
    >/dev/null
fi

if az network nsg rule show \
  --resource-group "${RESOURCE_GROUP}" \
  --nsg-name "${DB_NSG_NAME}" \
  --name DenyPostgresFromOtherVnet \
  >/dev/null 2>&1; then
  log "Updating NSG rule DenyPostgresFromOtherVnet."
  az network nsg rule update \
    --resource-group "${RESOURCE_GROUP}" \
    --nsg-name "${DB_NSG_NAME}" \
    --name DenyPostgresFromOtherVnet \
    --source-address-prefixes VirtualNetwork \
    --source-port-ranges "*" \
    --destination-address-prefixes "*" \
    --destination-port-ranges 5432 \
    --access Deny \
    --protocol Tcp \
    --direction Inbound \
    >/dev/null
else
  log "Creating NSG rule DenyPostgresFromOtherVnet."
  az network nsg rule create \
    --resource-group "${RESOURCE_GROUP}" \
    --nsg-name "${DB_NSG_NAME}" \
    --name DenyPostgresFromOtherVnet \
    --priority 310 \
    --source-address-prefixes VirtualNetwork \
    --source-port-ranges "*" \
    --destination-address-prefixes "*" \
    --destination-port-ranges 5432 \
    --access Deny \
    --protocol Tcp \
    --direction Inbound \
    >/dev/null
fi

DB_PRIVATE_IP="$(az network nic show \
  --ids "${DB_NIC_ID}" \
  --query "ipConfigurations[0].privateIPAddress" \
  --output tsv)"

[[ -n "${DB_PRIVATE_IP}" ]] || fail "Could not determine private IP for database VM ${DB_VM_NAME}."

POSTGRES_DB_ARG="$(shell_quote "${POSTGRES_DB}")"
POSTGRES_USER_ARG="$(shell_quote "${POSTGRES_USER}")"
POSTGRES_PASSWORD_ARG="$(shell_quote "${POSTGRES_PASSWORD}")"
DB_CONTAINER_NAME_ARG="$(shell_quote "${DB_CONTAINER_NAME}")"
DB_VOLUME_NAME_ARG="$(shell_quote "${DB_VOLUME_NAME}")"
ADMIN_USERNAME_ARG="$(shell_quote "${ADMIN_USERNAME}")"

log "Installing Docker and starting PostgreSQL on ${DB_VM_NAME}."
az vm run-command invoke \
  --resource-group "${RESOURCE_GROUP}" \
  --name "${DB_VM_NAME}" \
  --command-id RunShellScript \
  --scripts "
set -euo pipefail
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg lsb-release
sudo install -m 0755 -d /etc/apt/keyrings
if [[ ! -f /etc/apt/keyrings/docker.gpg ]]; then
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  sudo chmod a+r /etc/apt/keyrings/docker.gpg
fi
if [[ ! -f /etc/apt/sources.list.d/docker.list ]]; then
  echo \"deb [arch=\\\$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \\\$(. /etc/os-release && echo \\\$VERSION_CODENAME) stable\" | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
fi
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker ${ADMIN_USERNAME_ARG}
sudo docker volume create ${DB_VOLUME_NAME_ARG}
sudo docker rm -f ${DB_CONTAINER_NAME_ARG} >/dev/null 2>&1 || true
sudo docker run -d \
  --name ${DB_CONTAINER_NAME_ARG} \
  --restart unless-stopped \
  -e POSTGRES_DB=${POSTGRES_DB_ARG} \
  -e POSTGRES_USER=${POSTGRES_USER_ARG} \
  -e POSTGRES_PASSWORD=${POSTGRES_PASSWORD_ARG} \
  -v ${DB_VOLUME_NAME_ARG}:/var/lib/postgresql/data \
  -p ${DB_PRIVATE_IP}:5432:5432 \
  postgres:16-alpine
sudo docker exec ${DB_CONTAINER_NAME_ARG} pg_isready -U ${POSTGRES_USER_ARG} -d ${POSTGRES_DB_ARG}
" \
  >/dev/null

cat <<EOF

PostgreSQL database VM is ready.

Resource group:        ${RESOURCE_GROUP}
App VM name:           ${APP_VM_NAME}
App VM private IP:     ${APP_PRIVATE_IP}
Database VM name:      ${DB_VM_NAME}
Database VM private IP: ${DB_PRIVATE_IP}
Database container:    ${DB_CONTAINER_NAME}
Docker volume:         ${DB_VOLUME_NAME}
Allowed source:        ${SOURCE_PREFIX}

Use this DATABASE_URL format on the app VM:
  postgres://${POSTGRES_USER}:<password>@${DB_PRIVATE_IP}:5432/${POSTGRES_DB}

Do not commit the real DATABASE_URL or PostgreSQL password.
EOF
