# Server deployment runbook

This runbook is host-agnostic. Choose a container host, managed PostgreSQL service, and secret store that meet your operational needs; do not put credentials in the repository. The server image contains the API and production migration runner.

## Build the server image

From the repository root, build with the server Dockerfile (the build context must include the workspace packages and degree data):

```sh
docker build --platform linux/amd64 -f apps/server/Dockerfile -t jevschedule-server .
```

Push this image to the container host's registry using the host's normal release process. Configure the service to run `node dist/main.js` (the image default) and expose its configured port.

## Configure the service

Set these variables through the host's secret/configuration facility. Never commit production values or put credentials in command history.

| Variable | Value and behavior |
| --- | --- |
| `DATABASE_URL` | Managed PostgreSQL connection string. Include `sslmode=require` (for example, `postgres://USER:PASSWORD@HOST:5432/DATABASE?sslmode=require`); URL-encode special characters in credentials. |
| `HOST` | Set to `0.0.0.0` so the container accepts connections from the host. The code default is `127.0.0.1`. |
| `PORT` | The port exposed/routed by the host; defaults to `3000`. |
| `SECTION_SCRAPE_ENABLED` | `true` or `false`; defaults to `false`. Enable only when scheduled live section scraping is intended. |
| `SECTION_SCRAPE_DEPARTMENTS` | Comma-separated 2–4 letter department prefixes; defaults to `CSC` (for example, `CSC`). Used by scheduled section scraping and operator-triggered section scraping. |
| `CATALOG_SCRAPE_ENABLED` | `true` or `false`; defaults to `false`. Set `true` in production to schedule the CSC catalog scrape. |
| `CATALOG_BROWSER_CHANNEL` | Browser channel used by the catalog scraper; the server image sets this to `chrome`. |

`HOST`, `PORT` and scrape configuration are read by `apps/server/src/config.ts`. Keep scheduled scraping disabled unless the deployment is intended to contact LSU.

## Apply database migrations

Run the production migrator from the built image, as CI does in `.github/workflows/ci.yml`. Supply the production database URL through the host or operator's secure environment mechanism:

```sh
docker run --rm -e DATABASE_URL="$DATABASE_URL" jevschedule-server node docker/migrate.mjs
```

The command exits nonzero if a migration fails. Do not pass the URL as a literal in a shared shell or save it in the repository.

## Verify the service

After deployment, request the health endpoint through the service's public HTTPS base URL:

```sh
curl -fsS https://YOUR_PUBLIC_HOST/health
```

A successful response is HTTP 200. The container image also defines a Docker `HEALTHCHECK` for `/health`.

## Enable scheduled scraping

Set `SECTION_SCRAPE_ENABLED=true`, `CATALOG_SCRAPE_ENABLED=true`, and `SECTION_SCRAPE_DEPARTMENTS=CSC` in the host's secure configuration. The server runs both scrapes on its own schedule; no operator-machine scrape is required. The first catalog load takes about three hours because the catalog's robots.txt specifies a 120-second crawl delay.

After the initial load, verify that the public catalog endpoint returns a non-empty list:

```sh
curl -fsS https://YOUR_PUBLIC_HOST/courses?dept=CSC
```

## Point the desktop app at the deployed API

In GitHub repository settings, add or update the repository **Actions variable** `JEVSCHEDULE_API_URL` with the public HTTPS base URL of the API (for example, `https://api.example.org`, without an endpoint path). When set, the release workflow rejects non-HTTPS values; without it, packaged releases use the local server at `http://127.0.0.1:3000`. A non-empty runtime `JEVSCHEDULE_API_URL` overrides the build-time value.
