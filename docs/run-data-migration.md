# Run The SQLite To PostgreSQL Data Migration

Use this runbook on the app VM after the dedicated PostgreSQL database VM has
been created and before the PostgreSQL-backed app stack is started for normal
traffic.

## 1. Ensure The DB VM Exists

Create or verify the dedicated PostgreSQL database VM:

```bash
POSTGRES_PASSWORD='<real-password>' bash scripts/azure/setup-postgres-vm.sh
```

Verify PostgreSQL is running on the DB VM:

```bash
az vm run-command invoke \
  --resource-group rizzlerpies-rg \
  --name rizzlerpies-db-vm \
  --command-id RunShellScript \
  --scripts "sudo docker exec rizzlerpies-postgres pg_isready -U rizzlerpies -d rizzlerpies"
```

## 2. Set DATABASE_URL On The App VM

Set `DATABASE_URL` in the app VM shell or deployment environment. Use the DB VM
private IP and the real password:

```bash
export DATABASE_URL='postgres://rizzlerpies:<password>@<db-private-ip>:5432/rizzlerpies'
```

Do not commit the real value.

## 3. Run Schema Migrations

Run the PostgreSQL schema migrations against the dedicated database VM:

```bash
npm run db:migrate
```

## 4. Run The One-Time Data Migration

There are two supported data migration compose paths. They use the same
migration script but mount SQLite from different places.

### Production VM Migration

Use this on the app VM. It mounts the legacy Docker volume:

```text
DATABASE_PATH=/data/app.db
```

Run the migration override from the app VM. It mounts the legacy SQLite
`app_data` volume read-only and writes the existing cookbook data to
PostgreSQL:

```bash
docker compose -f docker-compose.yml -f docker-compose.migration.yml run --rm migrate-sqlite-data
```

This command targets only the `migrate-sqlite-data` service. It does not start
the proxy/Nginx service and the migration service exposes no ports.

### Local File-Based Migration Test

Use this on a developer machine or in CI-style validation when the repository
fixture exists at `legacy/src/app.db`. It mounts the local SQLite file:

```text
DATABASE_PATH=/seed/app.db
```

Start the local PostgreSQL helper first:

```bash
export DATABASE_URL='postgres://rizzlerpies:rizzlerpies@postgres:5432/rizzlerpies'
docker compose -f docker-compose.yml -f docker-compose.local-postgres.yml up -d postgres
```

Run schema migrations:

```bash
docker compose -f docker-compose.yml -f docker-compose.local-postgres.yml run --rm app-a npm run db:migrate
```

Then run the local file migration:

```bash
docker compose -f docker-compose.yml -f docker-compose.local-postgres.yml -f docker-compose.migration.local.yml run --rm migrate-sqlite-data
```

If `legacy/src/app.db` does not exist locally, use the production VM path with
the legacy `app_data` volume or restore a copy of the legacy SQLite file before
running the local migration test.

## 5. Verify Row Counts

The migration command prints row counts before and after migration for:

- `recipes`
- `ingredients`
- `tags`
- `recipe_ingredients`
- `recipe_tags`

The PostgreSQL target counts after migration must match the SQLite source
counts printed by the command.

## 6. Start The PostgreSQL Runtime Stack

Start the app stack with the same `DATABASE_URL` still set:

```bash
docker compose up -d --build --remove-orphans
```

Verify readiness through the proxy:

```bash
curl -k https://127.0.0.1/readyz
```

The main app stack now uses PostgreSQL through `DATABASE_URL`. The legacy
`app_data` volume is retained for exam review, one-time migration evidence, and
rollback planning.
