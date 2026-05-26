# Azure VM Deployment With Docker Compose

## Target Topology

Production-like deployment is split across two VM roles:

- App VM: Nginx reverse proxy, `app-a`, and `app-b`
- DB VM: PostgreSQL on a dedicated private Azure VM
- Database connection: `DATABASE_URL`
- Public entrypoint: Nginx on the app VM

The `postgres` service in `docker-compose.yml` exists so a fresh local clone can
run as a complete system with `docker compose up --build`. The VM deployment
does not start that local PostgreSQL service; it uses `DATABASE_URL` for the DB
VM instead.

Traffic flow:

```text
Client -> Azure public IP -> Nginx proxy -> app-a/app-b -> private DB VM PostgreSQL
```

## Prepare The VM

Recommended baseline:

1. Run `bash scripts/azure/setup.sh` from a machine with Azure CLI access.
2. Run `scripts/azure/setup-postgres-vm.sh` for the dedicated DB VM.
3. Configure `DATABASE_URL` on the app VM with the DB VM private IP.
4. Add the printed `SSH_HOST`, `SSH_USER`, `SSH_PRIVATE_KEY` and optional
   `DEPLOY_PATH` values as GitHub Actions secrets.
5. Push to `main` to let the workflow deploy automatically.

## Start The Stack

The deployment workflow uploads the current commit to the VM and runs:

```bash
bash scripts/deploy/remote-deploy.sh /home/<user>/rizzlerpies/current
```

That script validates `DATABASE_URL`, runs schema migrations, starts only the
app/proxy services, and checks readiness:

```bash
docker compose -f docker-compose.yml up -d --build --remove-orphans --no-deps app-a app-b proxy
curl -k https://127.0.0.1/readyz
```

If Azure networking is configured correctly, the app should be reachable on:

```text
https://<vm-public-ip>/
```

## Day-2 Operations

Useful app VM commands:

```bash
docker compose -f docker-compose.yml logs -f app-a app-b proxy
docker compose -f docker-compose.yml ps
docker compose -f docker-compose.yml restart proxy
docker compose -f docker-compose.yml restart app-a app-b
docker compose -f docker-compose.yml up -d --build --remove-orphans --no-deps app-a app-b proxy
```

Health endpoints:

- `GET /healthz`: liveness for the application
- `GET /readyz`: readiness through the HTTPS proxy or directly against the app
- `GET /nginx-health`: proxy-only health check

## Why This Is DevOps-Friendly

- The proxy is the only public entrypoint.
- The application containers are isolated on an internal Docker network.
- Nginx can keep serving traffic through one app container if the other is unhealthy.
- PostgreSQL is reached over private Azure networking.
- The local PostgreSQL service keeps fresh clones simple without changing the
  VM runtime database target.
- The legacy `app_data` volume remains documented for migration evidence and
  rollback review.
