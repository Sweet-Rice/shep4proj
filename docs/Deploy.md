# Server deployment runbook

This runbook is host-agnostic. Choose a container host, managed PostgreSQL service, and secret store that meet your operational needs; do not put credentials in the repository. The server image contains the API and production migration runner, but not the browser dependencies needed by the operator-only live scrapers.

## Build the server image

From the repository root, build with the server Dockerfile (the build context must include the workspace packages and degree data):

```sh
docker build -f apps/server/Dockerfile -t jevschedule-server .
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
| `SECTION_SCRAPE_DEPARTMENTS` | Comma-separated 2–4 letter department prefixes; defaults to `CSC` (for example, `CSC`). Used by scheduled section scraping and the operator section scrape. |
| `SEAT_POLL_ENABLED` | `true` or `false`; defaults to `false`. Enable only when scheduled seat polling is intended. |
| `SEAT_POLL_INTERVAL_MINUTES` | Whole minutes from `60` through `35000`; defaults to `1440` (daily). Applies when seat polling is enabled. |

`HOST`, `PORT`, section scraping and seat polling are read by `apps/server/src/config.ts`; the defaults above are those in that configuration. Keep scheduled scraping and polling disabled unless the deployment is intended to contact LSU.

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

## Load catalog and section data

Run the live scrapes from an operator machine, not inside the production Alpine image. The operator machine needs Node/pnpm, the repository dependencies, and an installed Chrome browser for the catalog fetcher (to use Microsoft Edge instead, also set `CATALOG_BROWSER_CHANNEL=msedge`). These commands contact live LSU pages; use them only as deliberate operator actions, never as CI tests. Run them from the repository root, where the repository `.env` is available if desired:

```sh
DATABASE_URL="$DATABASE_URL" pnpm --filter @jevschedule/server db:scrape:catalog
DATABASE_URL="$DATABASE_URL" pnpm --filter @jevschedule/server db:scrape:sections
```

The catalog command loads the configured 2026–2027 catalog for CSC and reports stored/upserted courses and failures. The section command uses `SECTION_SCRAPE_DEPARTMENTS` (default `CSC`) and reports per-term results. Resolve reported failures before considering the initial data load complete.

## Point the desktop app at the deployed API

In GitHub repository settings, add or update the repository **Actions variable** `JEVSCHEDULE_API_URL` with the public HTTPS base URL of the API (for example, `https://api.example.org`, without an endpoint path). The release workflow requires this variable and rejects non-HTTPS values; packaged releases use it as the build-time API URL. A non-empty runtime `JEVSCHEDULE_API_URL` overrides the build-time value, and local builds without either setting use `http://127.0.0.1:3000`.
