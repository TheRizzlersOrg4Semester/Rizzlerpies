# Rizzlerpies

Node.js + Express + EJS server-side rendered recipe cookbook.

The app can run locally with Node.js, locally with Docker Compose, or on an
Azure app VM behind Nginx. The production database target is PostgreSQL on a
dedicated private database VM.

## Installation

Requirements:

- Node.js 20+
- npm
- Docker and Docker Compose for local PostgreSQL, local proxy testing, and VM
  deployment
- Bash for `npm run smoke:db`

Install dependencies:

```bash
npm ci
```

Environment examples:

- `.env.example`: local development shape
- `.env.production.example`: production app VM shape

Do not commit real `.env` files or real database credentials.

## Local Docker Start

For a fresh clone, this is the normal local startup:

```bash
docker compose up --build
```

That starts Nginx, two app containers, and a local PostgreSQL container.
On a fresh local PostgreSQL volume, the database is initialized automatically
with the recipe schema and recipe data from
`scripts/db/local-postgres-init/001_recipe_schema_and_data.sql`.

Use `docker compose up -d --build` if you want the same startup detached.
If an old local PostgreSQL volume already exists without the init data, reset it
once with `docker compose down -v` and then start again.

Local proxy endpoints:

- HTTP redirect: `http://localhost/`
- App through Nginx: `https://localhost/`
- Readiness through Nginx: `https://localhost/readyz`
- Proxy health: `http://localhost/nginx-health`
- Swagger UI through Nginx: `https://localhost/apidocs`

The local PostgreSQL service is for local development and CI-style validation.
Production PostgreSQL runs on the dedicated DB VM and is not deployed as part
of the app VM stack.

## Direct Local Node.js

Start the local PostgreSQL helper:

```bash
docker compose up -d postgres
```

On a fresh local PostgreSQL volume, the database is initialized automatically
with the recipe schema and recipe data from
`scripts/db/local-postgres-init/001_recipe_schema_and_data.sql`.

Set `DATABASE_URL` for a direct local Node.js run:

```bash
export DATABASE_URL='postgres://rizzlerpies:rizzlerpies@localhost:5432/rizzlerpies'
export PORT=4000
```

PowerShell uses `$env:DATABASE_URL = '...'` and `$env:PORT = '4000'` instead
of `export`.

Start the app:

```bash
npm start
```

The direct app listens on:

- App: `http://localhost:4000/`
- Readiness: `http://localhost:4000/readyz`
- Swagger UI: `http://localhost:4000/apidocs`

For local migrated data from `legacy/src/app.db`, see
[docs/run-data-migration.md](docs/run-data-migration.md).

## Azure VM Overview

Production-like deployment is split by responsibility:

- App VM: Nginx proxy, `app-a`, `app-b`
- DB VM: PostgreSQL on a dedicated private Azure VM
- Database connection: `DATABASE_URL`
- Public entrypoint: Nginx on the app VM

The app VM should reach PostgreSQL over private Azure networking. PostgreSQL
port `5432` must not be opened publicly.

Deployment is handled by GitHub Actions and
`scripts/deploy/remote-deploy.sh`. The deploy script validates `DATABASE_URL`,
runs PostgreSQL schema migrations, starts only the app/proxy services, and
waits for `/readyz`. On the VM, `DATABASE_URL` points to the dedicated DB VM
instead of the local Compose PostgreSQL service.

VM documentation:

- [PostgreSQL database VM](docs/postgres-db-vm.md)
- [Production data migration runbook](docs/production-data-migration-runbook.md)
- [Database migration plan](docs/database-migration-plan.md)

Current VM URL:

- App: `https://20.251.147.233/`
- Swagger UI: `https://20.251.147.233/apidocs`
- Readiness: `https://20.251.147.233/readyz`

## API Documentation

Swagger UI is served by the Express app at `/apidocs`.

- Direct local app: `http://localhost:4000/apidocs`
- Local Docker/Nginx proxy: `https://localhost/apidocs`
- Azure VM deployment: `https://20.251.147.233/apidocs`

The Swagger document is defined in `swagger.js` and mounted by `app.js`. The
file itself is not served as a static `/swagger.js` asset.

## Database Migration

The migration feature moves cookbook data from SQLite to PostgreSQL.

Before migration, SQLite lived at `DATABASE_PATH=/data/app.db` in the app VM
`app_data` Docker volume. After migration, runtime database access uses
`DATABASE_URL` and PostgreSQL on the dedicated DB VM.

The migrated database-backed scope is:

- `recipes`
- `ingredients`
- `tags`
- `recipe_ingredients`
- `recipe_tags`

`sqlite3` is kept only so the one-time legacy SQLite to PostgreSQL migration
can be reproduced for exam review. Runtime database access uses `pg`.

For new local clones, `docker-compose.yml` starts PostgreSQL and mounts
`scripts/db/local-postgres-init/` into Postgres' init directory. That makes the
local database complete from the first `docker compose up --build`. The
production migration runbooks remain as historical proof of the real SQLite to
PostgreSQL cutover.

Migration documentation:

- [Database migration plan](docs/database-migration-plan.md)
- [Run data migration](docs/run-data-migration.md)
- [Production data migration runbook](docs/production-data-migration-runbook.md)
- [Migration evidence](docs/postgres-cutover-evidence.md)

## Useful Commands

```bash
npm run lint
npm run db:migrate
npm run db:rollback
npm run smoke:db
```

`npm run smoke:db` uses `BASE_URL`, defaulting to
`http://localhost:4000`.

## Observability

The app initializes OpenTelemetry tracing in `tracing.js`.

Configure the OTLP trace endpoint with:

```text
OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=<collector-url>/v1/traces
```

The Docker Compose app containers default to `host.docker.internal:4318`, so a
local or VM-level collector can run outside the app stack.

## Project Structure

- `app.js`: Express routes and SSR setup
- `db.js`: PostgreSQL runtime database access
- `swagger.js`: OpenAPI document for Swagger UI
- `migrations/`: PostgreSQL schema migrations
- `scripts/db/`: one-time legacy data migration script and local PostgreSQL
  init SQL
- `scripts/azure/`: Azure VM setup scripts
- `scripts/deploy/`: remote deploy script
- `ops/nginx/`: Nginx proxy config and Dockerfile
- `docs/`: deployment and database migration documentation

## License

MIT. See [LICENSE](LICENSE).
