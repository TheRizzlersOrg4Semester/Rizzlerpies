#!/usr/bin/env bash

set -euo pipefail

RESOURCE_GROUP="${AZURE_RESOURCE_GROUP:-recipe-cookbook-rg}"
LOCATION="${AZURE_LOCATION:-northeurope}"
VM_NAME="${AZURE_VM_NAME:-recipe-cookbook-vm}"
VM_SIZE="${AZURE_VM_SIZE:-Standard_B1s}"
ADMIN_USERNAME="${AZURE_ADMIN_USERNAME:-azureuser}"
SSH_PUBLIC_KEY_PATH="${AZURE_SSH_PUBLIC_KEY:-$HOME/.ssh/id_ed25519.pub}"
SSH_PRIVATE_KEY_PATH="${SSH_PUBLIC_KEY_PATH%.pub}"
DEPLOY_PATH="${DEPLOY_PATH:-/home/${ADMIN_USERNAME}/rizzlerpies}"
RECREATE_RESOURCE_GROUP="${RECREATE_RESOURCE_GROUP:-false}"
INSTALL_DOCKER="${INSTALL_DOCKER:-true}"

log() {
  printf '[setup] %s\n' "$1"
}

fail() {
  printf '[setup] %s\n' "$1" >&2
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

require_cmd az
require_cmd ssh
require_cmd ssh-keygen

if ! az account show >/dev/null 2>&1; then
  log "Azure CLI is not logged in. Starting az login."
  az login >/dev/null
fi

if [[ ! -f "${SSH_PUBLIC_KEY_PATH}" ]]; then
  log "SSH public key not found at ${SSH_PUBLIC_KEY_PATH}. Generating a new ed25519 keypair."
  mkdir -p "$(dirname "${SSH_PRIVATE_KEY_PATH}")"
  ssh-keygen -t ed25519 -f "${SSH_PRIVATE_KEY_PATH}" -N "" -C "${VM_NAME}-deploy"
fi

if az group exists --name "${RESOURCE_GROUP}" | grep -q "true"; then
  if [[ "${RECREATE_RESOURCE_GROUP}" == "true" ]]; then
    log "Deleting existing resource group ${RESOURCE_GROUP} before recreation."
    az group delete --name "${RESOURCE_GROUP}" --yes --no-wait
    az group wait --deleted --name "${RESOURCE_GROUP}"
  else
    log "Resource group ${RESOURCE_GROUP} already exists and will be reused."
  fi
fi

if ! az group exists --name "${RESOURCE_GROUP}" | grep -q "true"; then
  log "Creating resource group ${RESOURCE_GROUP} in ${LOCATION}."
  az group create --name "${RESOURCE_GROUP}" --location "${LOCATION}" >/dev/null
fi

if ! az vm show --resource-group "${RESOURCE_GROUP}" --name "${VM_NAME}" >/dev/null 2>&1; then
  log "Creating VM ${VM_NAME}."
  az vm create \
    --resource-group "${RESOURCE_GROUP}" \
    --name "${VM_NAME}" \
    --image Ubuntu2204 \
    --size "${VM_SIZE}" \
    --admin-username "${ADMIN_USERNAME}" \
    --ssh-key-values "${SSH_PUBLIC_KEY_PATH}" \
    --public-ip-sku Standard \
    >/dev/null
else
  log "VM ${VM_NAME} already exists and will be reused."
fi

for port in 80 443; do
  log "Ensuring NSG rule exists for port ${port}."
  az vm open-port \
    --resource-group "${RESOURCE_GROUP}" \
    --name "${VM_NAME}" \
    --port "${port}" \
    --priority "$((200 + port))" \
    >/dev/null
done

VM_IP="$(az vm show \
  --resource-group "${RESOURCE_GROUP}" \
  --name "${VM_NAME}" \
  --show-details \
  --query publicIps \
  --output tsv)"

log "VM public IP: ${VM_IP}"

if [[ "${INSTALL_DOCKER}" == "true" ]]; then
  log "Installing Docker, Compose plugin, git and curl on the VM."
  ssh -o StrictHostKeyChecking=no "${ADMIN_USERNAME}@${VM_IP}" "bash -s" <<EOF
set -euo pipefail
sudo apt-get update
sudo apt-get install -y ca-certificates curl git gnupg lsb-release
sudo install -m 0755 -d /etc/apt/keyrings
if [[ ! -f /etc/apt/keyrings/docker.gpg ]]; then
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  sudo chmod a+r /etc/apt/keyrings/docker.gpg
fi
if [[ ! -f /etc/apt/sources.list.d/docker.list ]]; then
  echo "deb [arch=\$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \$(. /etc/os-release && echo \$VERSION_CODENAME) stable" | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
fi
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker ${ADMIN_USERNAME}
mkdir -p "${DEPLOY_PATH}/releases" "${DEPLOY_PATH}/shared"
EOF
fi

cat <<EOF

Azure infrastructure is ready.

Resource group: ${RESOURCE_GROUP}
VM name:        ${VM_NAME}
VM IP:          ${VM_IP}
Deploy path:    ${DEPLOY_PATH}

Add these GitHub Actions secrets before running the deploy job:
  SSH_HOST=${VM_IP}
  SSH_USER=${ADMIN_USERNAME}
  SSH_PRIVATE_KEY=<contents of ${SSH_PRIVATE_KEY_PATH}>
  DEPLOY_PATH=${DEPLOY_PATH}

To tear everything down later:
  scripts/azure/teardown.sh
EOF
