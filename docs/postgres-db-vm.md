# PostgreSQL Database VM

This document describes the dedicated PostgreSQL database VM used by the
database migration work. Production is intended to run PostgreSQL on this
separate VM, while the app VM continues to run the application, Nginx, and
observability services.

`docker-compose.yml` also contains a local PostgreSQL service so fresh clones
can run a complete app with `docker compose up --build`. That local service is
not the production database target. On the app VM, the deployment script starts
only `app-a`, `app-b`, and `proxy`, and the app containers connect to this
dedicated DB VM through `DATABASE_URL`.

## Run The Setup Script

Run the script from a machine with Azure CLI access:

```bash
POSTGRES_PASSWORD='<real-password>' bash scripts/azure/setup-postgres-vm.sh
```

The script creates or reuses a dedicated database VM, installs Docker on that
VM, starts PostgreSQL in Docker, stores PostgreSQL data in a persistent Docker
volume, and prints the private database VM IP.

The app VM should already exist before running this script:

```bash
bash scripts/azure/setup.sh
```

## Environment Variables

The script supports these variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `RESOURCE_GROUP` | `recipe-cookbook-rg` | Azure resource group. |
| `LOCATION` | `northeurope` | Azure region used when resources must be created. |
| `APP_VM_NAME` | `recipe-cookbook-vm` | Existing app VM that will connect to PostgreSQL. |
| `DB_VM_NAME` | `recipe-cookbook-db-vm` | Dedicated PostgreSQL VM name. |
| `ADMIN_USERNAME` | `azureuser` | Admin username for the database VM. |
| `VNET_NAME` | derived from app VM | Existing VNet used by the app VM. |
| `SUBNET_NAME` | derived from app VM | Existing subnet used by the app VM. |
| `DB_SIZE` | `Standard_B1s` | Azure VM size for the database VM. |
| `POSTGRES_DB` | `rizzlerpies` | PostgreSQL database name. |
| `POSTGRES_USER` | `rizzlerpies` | PostgreSQL username. |
| `POSTGRES_PASSWORD` | required override | PostgreSQL password. Do not commit it. |

Optional variables:

- `SSH_PUBLIC_KEY_PATH`: SSH public key path. Defaults to
  `$HOME/.ssh/id_ed25519.pub`.
- `ALLOW_APP_SUBNET`: when `true`, allows TCP 5432 from the app subnet instead
  of only the app VM private IP. Default is `false`.

## Verify PostgreSQL On The DB VM

Use Azure VM run command to verify the container and database health:

```bash
az vm run-command invoke \
  --resource-group recipe-cookbook-rg \
  --name recipe-cookbook-db-vm \
  --command-id RunShellScript \
  --scripts "sudo docker ps --filter name=rizzlerpies-postgres && sudo docker exec rizzlerpies-postgres pg_isready -U rizzlerpies -d rizzlerpies"
```

The expected result is that the `rizzlerpies-postgres` container is running and
`pg_isready` reports that PostgreSQL is accepting connections.

## Test From The App VM

From the app VM, test the private network path to the database VM. Replace the
host and password placeholders with the printed private DB VM IP and your real
password:

```bash
docker run --rm postgres:16-alpine \
  psql "postgres://rizzlerpies:<password>@<db-private-ip>:5432/rizzlerpies" \
  -c "select 1;"
```

This verifies that the app VM can reach PostgreSQL over TCP 5432 using the same
private path the application will use later.

## Configure DATABASE_URL On The App VM

The application should use `DATABASE_URL` to connect to the dedicated database
VM after the runtime database access is switched to PostgreSQL:

```text
DATABASE_URL=postgres://rizzlerpies:<password>@<db-private-ip>:5432/rizzlerpies
```

Place the real `DATABASE_URL` in the app VM deployment environment. The value
can be provided through a GitHub Actions secret, a deployment-generated env file
on the app VM, or another secret management mechanism used for the exam
deployment.

Use `.env.production.example` as the committed shape of the production
environment:

```text
DATABASE_URL=postgres://<postgres_user>:<postgres_password>@<db_vm_private_ip>:5432/<database_name>
NODE_ENV=production
PORT=4000
```

Do not commit real `.env` files, real PostgreSQL passwords, or the full
production `DATABASE_URL`.

The app VM must reach the database VM over private Azure networking. PostgreSQL
port `5432` must not be opened publicly to the internet.

## Security Rationale

- The database VM is created without a public IP.
- PostgreSQL runs on the database VM with a persistent Docker volume.
- The PostgreSQL container binds port `5432` to the database VM private IP.
- The NSG allows TCP `5432` only from the app VM private IP by default.
- The NSG explicitly denies TCP `5432` from the rest of the VNet after the app
  VM allow rule, so Azure's default VNet inbound rule does not broaden access.
- `ALLOW_APP_SUBNET=true` can be used if the deployment needs subnet-level
  access for multiple app VMs.
- The public entrypoint remains the app VM proxy; PostgreSQL is not exposed to
  the internet.
