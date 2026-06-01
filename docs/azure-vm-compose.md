# Azure VM Deployment With Docker Compose

## Target Topology

Production-like deployment is split across two Azure VMs:

- App VM `rizzlerpies-vm`: Nginx reverse proxy plus `app-a` and `app-b`
  Express containers.
- DB VM `rizzlerpies-db-vm`: PostgreSQL running in Docker with a persistent
  Docker volume.
- Public entrypoint: Nginx on the app VM, exposed on ports `80` and `443`.
- Private database path: app containers connect to PostgreSQL with
  `DATABASE_URL`.

Traffic flow:

```text
Client
  -> Azure public IP
  -> app VM Nginx proxy
  -> app-a / app-b
  -> private DB VM PostgreSQL
```

PostgreSQL must not be exposed publicly and must not be added as a production
service in the main app VM `docker-compose.yml` stack.

## Prepare The VMs

Recommended baseline:

1. Run `bash scripts/azure/setup.sh` from a machine with Azure CLI access.
2. Run `POSTGRES_PASSWORD='<real-password>' bash scripts/azure/setup-postgres-vm.sh`.
3. Add the printed `SSH_HOST`, `SSH_USER`, `SSH_PRIVATE_KEY`, and optional
   `DEPLOY_PATH` values as GitHub Actions secrets.
4. Create `${DEPLOY_PATH}/shared/production.env` on the app VM with the real
   production database connection:

```text
DATABASE_URL=postgres://<postgres_user>:<postgres_password>@<db_vm_private_ip>:5432/<database_name>
NODE_ENV=production
PORT=4000
```

Do not commit the real `DATABASE_URL` or PostgreSQL password.

## Start The Stack

The deployment workflow uploads the current commit to the app VM and runs:

```bash
bash scripts/deploy/remote-deploy.sh /home/<user>/rizzlerpies/current
```

That script:

- loads `${DEPLOY_PATH}/shared/production.env` when present
- validates `DATABASE_URL`
- runs PostgreSQL schema migrations
- starts the Docker Compose app stack
- waits for `https://127.0.0.1/readyz`

If Azure networking is configured correctly, the app should be reachable on:

```text
https://<app-vm-public-ip>/
```

## Day-2 Operations

Useful app VM commands:

```bash
docker compose logs -f
docker compose ps
docker compose restart proxy
docker compose restart app-a app-b
docker compose up -d --build
```

Health endpoints:

- `GET /healthz`: application liveness
- `GET /readyz`: readiness through the HTTPS proxy or directly against the app
- `GET /nginx-health`: proxy-only health check

To destroy the Azure resource group completely:

```bash
bash scripts/azure/teardown.sh
```

## Why This Is DevOps-Friendly

- The proxy is the only public application entrypoint.
- The application containers are isolated on an internal Docker network.
- Nginx can keep serving traffic through one app container if the other is
  unhealthy.
- Runtime data lives in PostgreSQL on a dedicated private DB VM.
- PostgreSQL data is stored in a persistent Docker volume on the DB VM.
- The DB VM NSG allows TCP `5432` only from the app VM private IP by default.
- The deploy script fails early when `DATABASE_URL` is missing and runs schema
  migrations before replacing the running app stack.

## Scaling Later

This setup keeps the public proxy and application containers on one app VM, but
the database is already separated. To add more backend VMs later:

1. Create additional private app VMs.
2. Allow PostgreSQL access from the app subnet with `ALLOW_APP_SUBNET=true` or
   add explicit NSG allow rules for each app VM private IP.
3. Point each app deployment at the same private PostgreSQL `DATABASE_URL`.
4. Update the public proxy or load balancer to route traffic to all app VMs.
