# Database Migration Plan

## Purpose

This plan defines the database migration scope for the Awesome Recipe Cookbook
application. The current application uses SQLite, which is practical for a
single VM but is not suitable when the backend is scaled across multiple
backend VMs.

The target state is an application VM connecting to PostgreSQL on a dedicated
database VM. Future backend VMs must be able to read from and write to the same
database service without relying on a shared local SQLite file.

## Current Production-Like Topology

The application is a Node.js, Express, and EJS server-side rendered app designed
to run on an Azure VM with Docker Compose.

The current app VM compose stack runs:

- `proxy`: Nginx reverse proxy
- `app-a`: first application container
- `app-b`: second application container
- `signoz`: local observability service
- `app_data`: Docker volume containing the SQLite database file

The application containers currently use:

```text
DATABASE_PATH=/data/app.db
```

That path points to the SQLite database stored in the `app_data` Docker volume.
This keeps the database outside the image and persistent across container
restarts, but it still ties the database to the app VM.

## Scaling Problem

SQLite is a local file database. It is not a safe production database backend
for multiple backend VMs because each VM would either need its own copy of the
database file or unsafe shared file access.

That would create risks around:

- inconsistent cookbook data between backend VMs
- file locking and concurrent writes
- backup and restore operations
- deployment rollback clarity
- production recovery after VM replacement

Before the backend is expanded beyond the current app VM, the cookbook data must
move to a network-accessible database service.

## Target Production Topology

The target production architecture is:

```text
Client -> Azure public IP -> app VM proxy -> app-a/app-b -> PostgreSQL DB VM
```

PostgreSQL will run on a dedicated database VM and be reached by the application
over private networking. The database VM should not be exposed as a public app
entrypoint.

PostgreSQL must not be treated as a production service inside the main app VM
compose stack. The production app VM compose stack should remain focused on the
application, proxy, and observability services. Database configuration for
production should come from environment variables, especially `DATABASE_URL`.

## Local And CI Use

A PostgreSQL compose override may be added later for local development and
CI-style validation. That local/CI database is only a test and development
helper.

It must not redefine the production topology as "PostgreSQL runs inside the app
VM compose stack."

## Active Database-Backed Scope

The migration scope is limited to the current cookbook data used by the
application routes and views:

- `recipes`
- `ingredients`
- `tags`
- `recipe_ingredients`
- `recipe_tags`

These tables must keep the existing route and UI behavior stable after the
backend changes from SQLite to PostgreSQL.

## Out Of Scope

The following items are intentionally outside this database migration package:

- `users`
- auth flows
- new recipe CRUD behavior
- UI redesign
- unrelated API changes

The migration should avoid introducing new product behavior while the database
backend is being changed.

## Data Preservation Requirement

Existing cookbook data must be preserved and migrated from SQLite to PostgreSQL.
The migration must not replace the existing cookbook data with only a hardcoded
seed script.

The migration path must include a one-time legacy data migration that reads from
the existing SQLite database through `DATABASE_PATH` and writes the current
cookbook records into PostgreSQL through `DATABASE_URL`.

`sqlite3` will remain in the project temporarily because it is required for that
one-time migration from existing SQLite data. It should not be removed until the
PostgreSQL migration flow is verified and documented.

## DevOps Focus

The migration must be delivered in small, reviewable packages so the exam branch
history shows the progression clearly:

- document the VM-based scope before changing tooling
- add PostgreSQL tooling before adding schema migrations
- create PostgreSQL schema migrations before changing runtime database access
- migrate real SQLite data before switching production traffic
- validate the flow locally and in CI
- document deployment, rollback, and production runbook steps

Operationally, the migration work must cover:

- repeatable PostgreSQL schema migrations with `node-pg-migrate`
- a one-time SQLite-to-PostgreSQL data migration path
- local/CI PostgreSQL validation without changing production topology
- Azure DB VM setup for the dedicated PostgreSQL host
- app VM environment documentation for `DATABASE_URL`
- deployment steps that run migrations before app rollout
- rollback notes while the legacy SQLite data is preserved for exam review

## Branch Strategy

Work should happen on:

```text
feature/db-postgres-migration
```

The existing feature branch should be preserved for exam review. Each package
should be committed independently using the agreed commit style, for example:

- `docs(db): ...`
- `chore(db): ...`
- `feat(db): ...`
- `refactor(db): ...`
- `test(db): ...`
- `ci(db): ...`
- `ops(db): ...`
- `ops(azure): ...`

Each package must be completed before the next package starts:

1. make only the scoped change
2. run relevant checks
3. commit the change
4. report what changed
5. wait for the next instruction
