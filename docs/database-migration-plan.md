# Database Migration Plan

## Purpose

This document finalizes the SQLite to PostgreSQL migration scope for the
Awesome Recipe Cookbook application. The goal is to keep the existing app
behavior and cookbook data while changing the database backend to a topology
that can support multiple backend VMs.

The migration is intentionally delivered as a preserved feature branch:

```text
feature/db-postgres-migration
```

The commit history shows the DevOps progression from documentation, to
tooling, schema, data migration, runtime refactor, deployment, tests, CI, and
runbooks.

## Final Before And After Architecture

Before migration:

```text
Client
  -> Azure public IP
  -> app VM
     -> Nginx proxy
     -> app-a / app-b
     -> SQLite file at /data/app.db in the app_data Docker volume
     -> SigNoz
```

The old runtime database configuration was:

```text
DATABASE_PATH=/data/app.db
```

After migration:

```text
Client
  -> Azure public IP
  -> app VM
     -> Nginx proxy
     -> app-a / app-b
     -> PostgreSQL on dedicated private DB VM
     -> SigNoz
```

The new runtime database configuration is:

```text
DATABASE_URL=postgres://<postgres_user>:<postgres_password>@<db_vm_private_ip>:5432/<database_name>
```

The app VM production compose stack keeps Nginx, `app-a`, `app-b`, and SigNoz.
It does not add PostgreSQL as a production service.

## Why PostgreSQL Runs On A Separate DB VM

SQLite is a local file database. It works for a single VM, but it is not a safe
backend when the application is scaled to multiple backend VMs. Each VM would
otherwise need a local copy of the database file or unsafe shared file access.

That creates operational risks:

- inconsistent recipe data between app VMs
- file locking and concurrent write problems
- unclear backup and restore ownership
- difficult rollback after app VM replacement
- no clean shared database target for future backend VMs

PostgreSQL on a dedicated DB VM gives all app containers and future app VMs one
shared database endpoint. The DB VM is reached over private Azure networking,
and TCP `5432` is restricted by NSG rules to the app VM private IP or app
subnet. PostgreSQL is not opened publicly to the internet.

## Production Versus Local And CI

Production:

- PostgreSQL runs on a dedicated database VM.
- The app VM uses `DATABASE_URL`.
- The main `docker-compose.yml` does not define a PostgreSQL production
  service.
- `app_data` remains documented as legacy SQLite storage for one-time migration,
  rollback, and exam review.

Local development and CI:

- `docker-compose.local-postgres.yml` can start a local PostgreSQL helper.
- GitHub Actions uses a PostgreSQL service container.
- CI imports controlled recipe test data because it does not have the
  production SQLite Docker volume.
- These helper databases validate the migration flow but do not redefine the
  production architecture.

## Active Database-Backed Scope

Only the current recipe model is included:

- `recipes`
- `ingredients`
- `tags`
- `recipe_ingredients`
- `recipe_tags`

Existing routes and EJS views should keep their behavior. The migration changes
where the app reads and writes recipe data, not what the recipe UI does.

## Out Of Scope

These items are intentionally excluded:

- `users`
- auth flows
- new recipe CRUD behavior
- UI redesign
- unrelated API changes

Users and auth are out of scope because they are not part of the active
database-backed recipe model for this exam migration. Adding or redesigning
auth would mix a product feature into an infrastructure migration and make the
database change harder to review safely.

## How Existing SQLite Data Is Preserved

The migration preserves the current cookbook data instead of replacing it with
new hardcoded seed data.

The preservation path is:

1. Back up `/data/app.db` from the legacy `app_data` Docker volume.
2. Run PostgreSQL schema migrations with `node-pg-migrate`.
3. Run `scripts/db/migrate-sqlite-to-postgres.js` through
   `docker-compose.migration.yml`.
4. Read SQLite from `DATABASE_PATH=/data/app.db`.
5. Write PostgreSQL through `DATABASE_URL`.
6. Preserve integer IDs and relation rows for the five active recipe tables.
7. Verify before/after row counts for each migrated table.

The data migration script uses one PostgreSQL transaction and stops if the
target recipe tables already contain data, unless `FORCE_MIGRATION=true` is set
explicitly. `sqlite3` stays in the project temporarily because it is required
for this one-time legacy data migration.

## DevOps Elements

Branch history:

- Work is split into small package commits on `feature/db-postgres-migration`.
- The branch is preserved for exam review.
- Commit prefixes show the type of work, for example `docs(db)`, `feat(db)`,
  `ops(db)`, `test(db)`, and `ci(db)`.

Migrations:

- PostgreSQL schema changes live in `migrations/`.
- `npm run db:migrate` applies schema migrations.
- `npm run db:rollback` rolls back the latest schema migration.
- The one-time SQLite data migration is separate from schema migration.

Deployment script:

- `scripts/deploy/remote-deploy.sh` fails clearly when `DATABASE_URL` is
  missing.
- It validates Docker Compose config.
- It runs `npm run db:migrate` against PostgreSQL before starting the app
  stack.
- It does not run the one-time SQLite data migration automatically.

Smoke tests:

- `scripts/test/smoke-db.sh` checks `/readyz`, `/`, `/recipes/1/`, and recipe
  API endpoints.
- It does not test user endpoints.
- GitHub Actions runs schema migration, CI data import, starts the app, waits
  for `/readyz`, and runs `npm run smoke:db`.

Rollback:

- Keep the SQLite backup and `app_data` Docker volume through the exam/demo.
- If cutover fails, revert the app VM `current` symlink to the previous
  SQLite-based release.
- Restore the old SQLite runtime configuration if necessary.
- Do not delete legacy SQLite data until the migration has been verified and
  the exam/demo is complete.

Azure networking and NSG:

- `scripts/azure/setup-postgres-vm.sh` creates or reuses the dedicated DB VM.
- PostgreSQL runs in Docker on the DB VM with a persistent Docker volume.
- The DB VM has no public PostgreSQL entrypoint.
- NSG rules allow TCP `5432` from the app VM private IP by default, or from the
  app subnet only when explicitly configured.

## Changed Files In This Migration Branch

Relative to `main`, the migration work changes or adds:

- `.env.example`
- `.env.production.example`
- `.github/workflows/node-ci.yml`
- `README.md`
- `db.js`
- `docker-compose.local-postgres.yml`
- `docker-compose.migration.yml`
- `docker-compose.yml`
- `docs/database-migration-plan.md`
- `docs/postgres-db-vm.md`
- `docs/production-data-migration-runbook.md`
- `docs/run-data-migration.md`
- `migrations/20260525120000_initial_recipe_schema.js`
- `package-lock.json`
- `package.json`
- `scripts/azure/setup-postgres-vm.sh`
- `scripts/db/migrate-sqlite-to-postgres.js`
- `scripts/deploy/remote-deploy.sh`
- `scripts/test/smoke-db.sh`

## Supporting Documentation

- [PostgreSQL database VM](postgres-db-vm.md)
- [One-time data migration command notes](run-data-migration.md)
- [Production data migration runbook](production-data-migration-runbook.md)
