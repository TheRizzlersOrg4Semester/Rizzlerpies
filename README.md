# Rizzlerpies

Node.js + Express SSR app using EJS templates.

## Run Directly

1. Install dependencies:
   `npm install`
2. Start the server:
   `npm start`

The app listens on `http://localhost:4000` by default.

## Run With Proxy And Docker Compose

This repository now includes a simple Nginx reverse proxy in front of the app.

```bash
docker compose up -d --build
```

Endpoints:

- App through proxy: `http://localhost/`
- Readiness through proxy: `http://localhost/readyz`
- Proxy-only health: `http://localhost/nginx-health`

The Compose stack is designed for a single Azure VM first, with a clean path to split the proxy and app onto separate VMs later.

More deployment detail: [docs/azure-vm-compose.md](docs/azure-vm-compose.md)
