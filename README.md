# Rizzlerpies

Node.js + Express SSR app using EJS templates.

## Run Directly

1. Install dependencies:
   `npm install`
2. Copy `.env.example` to `.env` so the app can read the local PostgreSQL connection string automatically when it starts.
3. Start a local PostgreSQL instance:
   `docker compose -f docker-compose.local-postgres.yml up -d postgres`
4. Apply the database schema:
   `npm run db:migrate`
5. Start the server:
   `npm start`

The app listens on `http://localhost:4000` by default.

## Run With Proxy And Docker Compose

This repository includes an Nginx reverse proxy in front of two Express app
containers. Nginx load balances traffic across `app-a` and `app-b` on the
internal Docker network.

```bash
docker compose up -d --build
```

Endpoints:

- HTTP redirect entrypoint: `http://localhost/`
- App through proxy: `https://localhost/`
- Readiness through proxy: `https://localhost/readyz`
- Proxy-only health: `http://localhost/nginx-health`
- SigNoz observability UI: `http://localhost:3301`

The Compose stack is designed for a single Azure VM first, with a clean path to
split the proxy and app containers onto separate VMs later.

## Database Migration Feature

The cookbook database migration moves the app from local SQLite to PostgreSQL
for a multi-VM production architecture.

Before the migration, the app used SQLite from `DATABASE_PATH=/data/app.db` in
the app VM `app_data` Docker volume. After the migration, the app uses
`DATABASE_URL` to connect to PostgreSQL on a dedicated database VM over private
Azure networking.

Migration documentation:

- [Database migration plan](docs/database-migration-plan.md)
- [PostgreSQL database VM](docs/postgres-db-vm.md)
- [Production data migration runbook](docs/production-data-migration-runbook.md)

## Local PostgreSQL Validation

Production PostgreSQL is intended to run on a dedicated database VM, not inside
the main app VM Compose stack. For local development and CI-style validation,
use the local-only override:

```bash
docker compose -f docker-compose.yml -f docker-compose.local-postgres.yml up -d postgres
```

## Infrastructure Automation

Azure infrastructure scripts now live in `scripts/azure/`:

- `scripts/azure/setup.sh` creates or reuses the resource group and VM, opens HTTP/HTTPS and installs Docker, Compose, git and curl on the VM.
- `scripts/azure/teardown.sh` deletes the Azure resource group when the environment is no longer needed.

Example setup:

```bash
bash scripts/azure/setup.sh
```

The setup script prints the GitHub Actions secrets you need to configure afterwards:

- `SSH_HOST`
- `SSH_USER`
- `SSH_PRIVATE_KEY`
- `DEPLOY_PATH` (optional, defaults to `/home/<user>/rizzlerpies`)

Teardown:

```bash
bash scripts/azure/teardown.sh
```

## Automated Deployment

The GitHub Actions workflow in `.github/workflows/node-ci.yml` now deploys automatically on `push` to `main` after the smoke tests pass.

Deployment flow:

1. GitHub Actions validates the app locally.
2. The workflow packages the current commit and uploads it to the Azure VM over SSH.
3. The VM runs `scripts/deploy/remote-deploy.sh`, which validates `DATABASE_URL`, runs PostgreSQL schema migrations, executes `docker compose up -d --build --remove-orphans` and waits for the HTTPS `/readyz` endpoint behind Nginx.

## SigNoz observability

This project now includes SigNoz tracing support. The app exports OTLP traces to SigNoz at `http://signoz:4318/v1/traces`.

Run the stack with:

```bash
docker compose up -d --build
```

Then open the SigNoz UI at `http://localhost:3301` and generate traffic against the app to see traces.

More deployment detail: [docs/azure-vm-compose.md](docs/azure-vm-compose.md)
