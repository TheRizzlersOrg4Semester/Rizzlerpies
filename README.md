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

## Local Development

Start a local PostgreSQL helper:

```bash
docker compose -f docker-compose.yml -f docker-compose.local-postgres.yml up -d postgres
```

Set `DATABASE_URL` for a direct local Node.js run:

```bash
export DATABASE_URL='postgres://rizzlerpies:rizzlerpies@localhost:5432/rizzlerpies'
export PORT=4000
```

PowerShell uses `$env:DATABASE_URL = '...'` and `$env:PORT = '4000'` instead
of `export`.

Run schema migrations and start the app:

```bash
npm run db:migrate
npm start
```

The direct app listens on:

- App: `http://localhost:4000/`
- Readiness: `http://localhost:4000/readyz`
- Swagger UI: `http://localhost:4000/apidocs`

For local migrated data from `legacy/src/app.db`, see
[docs/run-data-migration.md](docs/run-data-migration.md).

## Local Docker Compose

For a local proxy-style run, use the local PostgreSQL override and set
`DATABASE_URL` to the Compose service hostname:

```bash
export DATABASE_URL='postgres://rizzlerpies:rizzlerpies@postgres:5432/rizzlerpies'
docker compose -f docker-compose.yml -f docker-compose.local-postgres.yml up -d postgres
docker compose -f docker-compose.yml -f docker-compose.local-postgres.yml run --rm app-a npm run db:migrate
docker compose -f docker-compose.yml -f docker-compose.local-postgres.yml up -d --build
```

Local proxy endpoints:

- HTTP redirect: `http://localhost/`
- App through Nginx: `https://localhost/`
- Readiness through Nginx: `https://localhost/readyz`
- Proxy health: `http://localhost/nginx-health`
- Swagger UI through Nginx: `https://localhost/apidocs`

The local PostgreSQL service is a development and CI helper only. Production
PostgreSQL is not part of the main app VM Compose stack.

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
runs PostgreSQL schema migrations, starts the Docker Compose stack, and waits
for `/readyz`.

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
- `scripts/db/`: one-time legacy data migration scripts
- `scripts/azure/`: Azure VM setup scripts
- `scripts/deploy/`: remote deploy script
- `ops/nginx/`: Nginx proxy config and Dockerfile
- `docs/`: deployment and database migration documentation

## License

MIT. See [LICENSE](LICENSE).
