# Production Data Migration Runbook

Use this checklist for the real SQLite to PostgreSQL migration on the app VM.
The goal is to preserve the existing cookbook data from the legacy SQLite
`app_data` volume and cut the running app over to PostgreSQL on the dedicated
database VM.

Do not commit real secrets. Replace placeholders before running commands.

## Variables

Set these values in the app VM shell before starting:

```bash
export DEPLOY_ROOT=/home/azureuser/rizzlerpies
export RELEASE_DIR="${DEPLOY_ROOT}/current"
export APP_DATA_VOLUME=rizzlerpies_app_data
export DATABASE_URL='postgres://<postgres_user>:<postgres_password>@<db_vm_private_ip>:5432/<database_name>'
```

## 1. Pre-checks

- [ ] Confirm the current app still works on SQLite before the cutover.

```bash
curl -kfsS https://127.0.0.1/readyz
curl -kfsS https://127.0.0.1/api/recipe/recipes/ >/tmp/sqlite-recipes-before.json
```

- [ ] Confirm the legacy SQLite Docker volume exists.

```bash
docker volume inspect "${APP_DATA_VOLUME}" >/dev/null
```

- [ ] Confirm the DB VM exists and note its private IP.

```bash
az vm show \
  --resource-group rizzlerpies-rg \
  --name rizzlerpies-db-vm \
  --query privateIps \
  --output tsv
```

- [ ] Confirm PostgreSQL is reachable from the app VM over private networking.

```bash
docker run --rm postgres:16-alpine pg_isready -d "${DATABASE_URL}"
```

- [ ] Confirm `DATABASE_URL` is configured on the app VM without printing it.

```bash
test -n "${DATABASE_URL:?DATABASE_URL is required}"
```

- [ ] Confirm no real secrets are committed.

```bash
git ls-files '.env*'
git status --short
```

Only committed example files such as `.env.example` and
`.env.production.example` are allowed. The real production `DATABASE_URL` must
stay in the app VM deployment environment or secret store.

## 2. Backup SQLite

- [ ] Create a timestamped backup directory.

```bash
cd "${RELEASE_DIR}"
export BACKUP_TS="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p backups
```

- [ ] Back up `/data/app.db` from the legacy `app_data` volume using a
temporary container.

```bash
docker run --rm \
  -e BACKUP_TS="${BACKUP_TS}" \
  -v "${APP_DATA_VOLUME}:/data:ro" \
  -v "${PWD}/backups:/backup" \
  alpine:3.20 \
  sh -c 'test -f /data/app.db && cp /data/app.db "/backup/app-${BACKUP_TS}.db" && ls -lh "/backup/app-${BACKUP_TS}.db"'
```

- [ ] If the old SQLite app container is still running and has `/data/app.db`
mounted, also copy directly from a running app container.

```bash
APP_CONTAINER="$(docker compose ps -q app-a)"
docker cp "${APP_CONTAINER}:/data/app.db" "backups/app-${BACKUP_TS}-from-app-a.db"
ls -lh "backups/app-${BACKUP_TS}"*.db
```

Keep these backup files until after the exam/demo is complete.

## 3. Schema

- [ ] Run the PostgreSQL schema migration against the dedicated DB VM.

```bash
cd "${RELEASE_DIR}"
test -n "${DATABASE_URL:?DATABASE_URL is required}"
docker compose build app-a
docker compose run --rm --no-deps app-a npm run db:migrate
```

If this fails, stop here. Do not run the data migration or cut over the app.

## 4. Data Migration

- [ ] Run the one-time SQLite to PostgreSQL data migration from the app VM.

```bash
cd "${RELEASE_DIR}"
docker compose -f docker-compose.yml -f docker-compose.migration.yml run --rm migrate-sqlite-data
```

- [ ] Verify the migration output shows matching source and target row counts
for these tables:

- `recipes`
- `ingredients`
- `tags`
- `recipe_ingredients`
- `recipe_tags`

- [ ] Verify PostgreSQL row counts directly.

```bash
docker run --rm postgres:16-alpine psql "${DATABASE_URL}" -P pager=off -c "
SELECT 'recipes' AS table_name, COUNT(*) FROM recipes
UNION ALL SELECT 'ingredients', COUNT(*) FROM ingredients
UNION ALL SELECT 'tags', COUNT(*) FROM tags
UNION ALL SELECT 'recipe_ingredients', COUNT(*) FROM recipe_ingredients
UNION ALL SELECT 'recipe_tags', COUNT(*) FROM recipe_tags
ORDER BY table_name;
"
```

The PostgreSQL counts must match the SQLite source counts printed by
`migrate-sqlite-data`.

## 5. Cutover

- [ ] Deploy the app version that uses `DATABASE_URL`.

```bash
cd "${RELEASE_DIR}"
test -n "${DATABASE_URL:?DATABASE_URL is required}"
bash scripts/deploy/remote-deploy.sh "${RELEASE_DIR}"
```

- [ ] If deploying manually instead of using `remote-deploy.sh`, start the app
stack with the same `DATABASE_URL`.

```bash
docker compose up -d --build --remove-orphans
```

- [ ] Run smoke tests against the app container.

```bash
docker compose exec app-a sh -lc 'BASE_URL=http://127.0.0.1:4000 npm run smoke:db'
```

- [ ] Check Nginx readiness from the app VM.

```bash
curl -kfsS https://127.0.0.1/readyz
```

- [ ] Check recipe pages in a browser through the normal public app URL.

Open these pages and confirm recipes render with migrated data:

- `/`
- `/recipes/1/`
- `/api/recipe/recipes/`
- `/api/recipe/ingredients/`
- `/api/recipe/tags/`

## 6. Rollback

- [ ] If the PostgreSQL-backed app fails, revert the `current` symlink to the
previous SQLite-based release.

```bash
cd "${DEPLOY_ROOT}"
ls -lt releases
ln -sfn "${DEPLOY_ROOT}/releases/<previous_sqlite_release_sha>" "${DEPLOY_ROOT}/current"
cd "${DEPLOY_ROOT}/current"
```

- [ ] Restore the old SQLite-based compose/runtime environment if necessary.

```bash
unset DATABASE_URL
export DATABASE_PATH=/data/app.db
docker compose up -d --build --remove-orphans
```

- [ ] Confirm the old SQLite app is healthy again.

```bash
curl -kfsS https://127.0.0.1/readyz
curl -kfsS https://127.0.0.1/api/recipe/recipes/ >/tmp/sqlite-recipes-rollback.json
```

- [ ] Keep the SQLite backup and the `app_data` volume.

Do not delete `app_data` until after the exam/demo is complete.

## 7. Evidence For Exam

Collect and preserve:

- [ ] Screenshot or log output from the SQLite pre-check.
- [ ] Timestamped SQLite backup filename and `ls -lh` output.
- [ ] Output from `npm run db:migrate`.
- [ ] Output from `migrate-sqlite-data`, including before/after row counts.
- [ ] Output from the direct PostgreSQL row count query.
- [ ] Output from `npm run smoke:db` and Nginx `/readyz`.
- [ ] Browser screenshots of recipe pages after cutover.
- [ ] Git commit history for the migration branch.

```bash
git branch --show-current
git log --oneline --decorate --max-count=25
```

- [ ] Before/after architecture notes:

Before migration: app VM runs Nginx, app-a, app-b, SigNoz, and SQLite data is
stored in the `app_data` Docker volume as `/data/app.db`.

After migration: app VM runs Nginx, app-a, app-b, and SigNoz; app containers
connect with `DATABASE_URL` to PostgreSQL on the dedicated private DB VM.
PostgreSQL is not a production service in the app VM compose stack.
