# PostgreSQL Cutover Evidence

Date: 2026-05-25

## Branch And Commit

- Branch: `db-postgres-migration-branch2`
- Verified commit: `113fa91 ops(deploy): load app vm production env`
- Base migration fixes included:
  - `7032077 fix(db): use valid node-pg-migrate migration filename`
  - `a81a9bc fix(db): support local sqlite file migration mount`

## Azure Architecture

- App VM: `cookbookVM`
  - Private IP: `10.0.0.5`
  - Public IP: `20.251.147.233`
- Database VM: `rizzlerpies-db-vm`
  - Private IP: `10.0.0.6`
  - Public IP: none
  - Region: `norwayeast`
  - Size used: `Standard_B2als_v2`
- PostgreSQL runs on the database VM in Docker with persistent volume `postgres_data`.
- App containers connect to PostgreSQL through `DATABASE_URL`.

## Network Evidence

The database VM network security group allows PostgreSQL only from the app VM:

```text
Name                       Priority    Access    Source          Port    Direction
-------------------------  ----------  --------  --------------  ------  -----------
AllowPostgresFromAppVm     300         Allow     10.0.0.5/32     5432    Inbound
DenyPostgresFromOtherVnet  310         Deny      VirtualNetwork  5432    Inbound
```

The app VM can reach PostgreSQL on the database VM:

```text
10.0.0.6:5432 - accepting connections
```

The database VM PostgreSQL container is listening:

```text
rizzlerpies-postgres  postgres:16-alpine  Up 47 minutes  0.0.0.0:5432->5432/tcp, [::]:5432->5432/tcp
127.0.0.1:5432 - accepting connections
```

## Data Migration Evidence

SQLite backup was created on the app VM before migration:

```text
/home/azureuser/Rizzlerpies/backups/app-20260525T172319Z.db
/home/azureuser/Rizzlerpies/backups/app-20260525T172319Z-from-app.db
```

One-time SQLite to PostgreSQL migration output:

```text
SQLite source row counts before migration:
  recipes: 4
  ingredients: 22
  tags: 6
  recipe_ingredients: 29
  recipe_tags: 12
PostgreSQL target row counts before migration:
  recipes: 0
  ingredients: 0
  tags: 0
  recipe_ingredients: 0
  recipe_tags: 0
PostgreSQL target row counts after migration:
  recipes: 4
  ingredients: 22
  tags: 6
  recipe_ingredients: 29
  recipe_tags: 12
SQLite to PostgreSQL data migration completed.
```

Direct PostgreSQL row count verification:

```text
     table_name     | count
--------------------+-------
 ingredients        |    22
 recipe_ingredients |    29
 recipe_tags        |    12
 recipes            |     4
 tags               |     6
```

## Runtime Evidence

The PostgreSQL-backed app stack is healthy on the app VM:

```text
NAME                  IMAGE               SERVICE   STATUS                    PORTS
rizzlerpies-app-a-1   rizzlerpies-app-a   app-a     Up 29 minutes (healthy)   4000/tcp
rizzlerpies-app-b-1   rizzlerpies-app-b   app-b     Up 29 minutes (healthy)   4000/tcp
rizzlerpies-proxy-1   rizzlerpies-proxy   proxy     Up 29 minutes (healthy)   0.0.0.0:80->80/tcp, 0.0.0.0:443->443/tcp
```

Old SQLite runtime container and broken one-off Signoz container are not running:

```text
no-old-or-broken-containers
```

Internal app smoke test passed:

```text
[smoke-db] Checking http://127.0.0.1:4000/readyz
[smoke-db] Checking http://127.0.0.1:4000/
[smoke-db] Checking http://127.0.0.1:4000/recipes/1/
[smoke-db] Checking http://127.0.0.1:4000/api/recipe/recipes/
[smoke-db] Checking http://127.0.0.1:4000/api/recipe/ingredients/
[smoke-db] Checking http://127.0.0.1:4000/api/recipe/tags/
[smoke-db] All database-backed smoke checks passed.
```

Public HTTPS smoke test passed:

```text
{"status":"ready"}
checking /
checking /recipes/1/
checking /api/recipe/recipes/
checking /api/recipe/ingredients/
checking /api/recipe/tags/
public-smoke-ok
```

## Deploy Evidence

`scripts/deploy/remote-deploy.sh` was verified after cutover. It loaded the app VM production environment, ran schema migrations, started the app stack, and passed the readiness check:

```text
[deploy] Loading deployment environment from /home/azureuser/Rizzlerpies/shared/production.env.
[deploy] DATABASE_URL is set; value is hidden.
[deploy] Running PostgreSQL schema migrations.
No migrations to run!
Migrations complete!
[deploy] Deployment succeeded.
```

The one-time SQLite data migration was run manually during cutover and must not be run automatically on future deploys.
