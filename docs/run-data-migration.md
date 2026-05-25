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
  --resource-group recipe-cookbook-rg \
  --name recipe-cookbook-db-vm \
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

Run the migration override from the app VM. It mounts the legacy SQLite
`app_data` volume read-only and writes the existing cookbook data to
PostgreSQL:

```bash
docker compose -f docker-compose.yml -f docker-compose.migration.yml run --rm migrate-sqlite-data
```

This command targets only the `migrate-sqlite-data` service. It does not start
the proxy/Nginx service and the migration service exposes no ports.

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
