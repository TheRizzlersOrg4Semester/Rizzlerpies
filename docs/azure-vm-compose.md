# Azure VM Deployment With Docker Compose

## Target Topology

For the first deployment stage, keep everything on one Azure VM:

- `proxy`: Nginx reverse proxy exposed on port `80`
- `app`: Express cookbook application on the internal Docker network
- `app_data`: Docker volume for the SQLite database file

Traffic flow:

`Client -> Azure public IP -> Nginx proxy -> Express app -> SQLite volume`

## Prepare The VM

Recommended baseline:

1. Run `bash scripts/azure/setup.sh` from a machine with Azure CLI access.
2. Add the printed `SSH_HOST`, `SSH_USER`, `SSH_PRIVATE_KEY` and optional `DEPLOY_PATH` values as GitHub Actions secrets.
3. Push to `main` to let the workflow deploy automatically.

## Start The Stack

The deployment workflow uploads the current commit to the VM and runs:

```bash
bash scripts/deploy/remote-deploy.sh /home/<user>/rizzlerpies/current
```

That script executes:

```bash
docker compose up -d --build --remove-orphans
curl -k https://127.0.0.1/readyz
```

If Azure networking is configured correctly, the app should be reachable on:

`https://<vm-public-ip>/`

## Day-2 Operations

Useful commands:

```bash
docker compose logs -f
docker compose ps
docker compose restart proxy
docker compose restart app
docker compose up -d --build
```

To destroy the environment completely:

```bash
bash scripts/azure/teardown.sh
```

Health endpoints:

- `GET /healthz`: liveness for the application
- `GET /readyz`: readiness through the HTTPS proxy or directly against the app
- `GET /nginx-health`: proxy-only health check

## Why This Is DevOps-Friendly

- The proxy is the only public entrypoint.
- The application is isolated on an internal Docker network.
- The SQLite file is moved out of the image and onto a persistent Docker volume.
- Both services have restart policies and health checks.
- The same `docker-compose.yml` works for local verification and the Azure VM.

## Splitting Across Multiple VMs Later

This setup is intentionally simple, but it leaves a clean path for the next step:

1. Move `proxy` onto its own VM and update the Nginx upstream from `app:4000` to the private IP or private DNS name of the application VM.
2. Keep the app private and only allow traffic from the proxy VM.
3. Replace SQLite with a network-accessible database before spreading the workload across multiple VMs.

Important note:

SQLite is a good fit for the first single-VM deployment, but it is not a good long-term choice once compute is split across machines. When you move beyond one VM, plan a database migration as part of that change.
