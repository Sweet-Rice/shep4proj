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

The catalog scrape covers CSC, then the departments in `apps/server/src/catalog/departments.ts`. It saves each course as it is parsed and, after the first full load (days at the 120 s crawl delay; CSC lands first, after about 3 h), fetches only courses that are missing from the database, refreshing each department once per semester window.
Section terms are scraped when first listed and refreshed once per semester window.

After the initial load, verify that the public catalog endpoint returns a non-empty list:

```sh
curl -fsS https://YOUR_PUBLIC_HOST/courses?dept=CSC
```

## Free hosting on Render + Neon (this project's deployment)

This project runs a Render free web service built from this GitHub repository and Neon Free for persistent PostgreSQL. GitHub Actions publishes the server image to GHCR, migrates the database from that digest, and asks Render to deploy the same commit after the migration succeeds. A separate scheduled workflow runs scraping on GitHub-hosted runners because Render's free instance sleeps and has only 512 MB of memory, which is not a suitable place for headless Chrome. The service may take about a minute to start after an idle period; desktop requests wait for the API response.

### One-time setup

1. Create a free Neon account and a Postgres project named `jevschedule`. Prefer Postgres 18 (or 17 if 18 is unavailable) and a region near the Render service, such as AWS US East Ohio. Copy the connection string, including `?sslmode=require`.
2. In the repository's `production` GitHub environment, create secrets `DATABASE_URL` (the Neon connection string) and `RENDER_DEPLOY_HOOK_URL` (the Render deploy hook URL). The environment is restricted to `main`; keep these values out of the repository and logs.
3. Create a Render web service from the GitHub repository `Sweet-Rice/shep4proj`. Set Language to **Docker**, Branch to `main`, Root Directory blank, Dockerfile Path to `apps/server/Dockerfile`, and Docker Build Context Directory to `.`. Choose the **Free** instance type, set Health Check Path to `/health`, and configure `DATABASE_URL` with the Neon connection string. Set **Auto-Deploy** to **Off** so a schema-changing commit cannot deploy before GitHub Actions runs migrations. Copy the service's HTTPS URL and deploy hook URL.
4. In repository **Actions variables**, set `RENDER_SERVICE_URL` (the service's HTTPS base URL, without a trailing slash), `SCRAPE_ENABLED` (`true` to enable scheduled scraping), and optionally `SECTION_SCRAPE_DEPARTMENTS` (comma-separated prefixes; defaults to `CSC`). These repository-level variables are available to job gates before a runner starts. Keep `DATABASE_URL` and `RENDER_DEPLOY_HOOK_URL` as secrets on the `production` environment.
5. In repository Actions variables, set `JEVSCHEDULE_API_URL` to the public HTTPS service URL, without an endpoint path. The desktop release workflow uses it when building installers.

### Restore the catalog database

Restore the verified database dump into Neon before making the service public. Use Neon's **direct, non-pooled** connection string for this restore, and a `pg_restore` client at least as new as the dump's PostgreSQL major version (for example, Postgres 18). A pooled Neon connection uses PgBouncer transaction mode, which can retain `pg_restore`'s session `search_path` setting and make tables appear missing to later queries.

```sh
docker run --rm -i -v "$PWD:/backup:ro" -e DATABASE_URL \
  postgres:18-alpine pg_restore --no-owner --no-privileges \
  --dbname "$DATABASE_URL" /backup/jevschedule.dump
```

Set `DATABASE_URL` in your shell's protected environment to Neon's direct connection string, and put the dump at `jevschedule.dump` in the current directory. The restore command does not print the URL; do not put it in shell history or commit it. If only a pooled URL is available, immediately run `psql "$DATABASE_URL" -c "RESET search_path"` after the restore, then check `psql "$DATABASE_URL" -c "SHOW search_path"` before starting the service or verifying it.

### Deploy and scrape

The `server-image` workflow publishes `latest` and a commit-specific tag. Its deploy job logs in to GHCR, pulls the image by the digest from that run, and runs the production migrator against Neon before asking the Git-backed Render service to deploy `${{ github.sha }}`. It then waits up to 25 minutes for `/health` to report that exact commit; the response includes `RENDER_GIT_COMMIT` so a still-running old instance cannot satisfy the check. Deployment is skipped until the repository variable `RENDER_SERVICE_URL` is configured. Trigger it with `workflow_dispatch` for the initial deployment. Afterward, verify `/health` and `/courses?dept=CSC` at the Render URL. GitHub Actions authenticates to GHCR for both migration and scheduled scraping, so the package does not need public visibility.

The `scrape` workflow runs daily and can also be triggered manually. It scrapes sections first and attempts the catalog scrape even if the section scrape fails. Scraping is disabled unless `SCRAPE_ENABLED` is exactly `true`; the catalog scraper follows `robots.txt` and does not use a crawl-delay override.

GitHub disables scheduled workflows in public repositories after 60 days without repository activity. Make a repository commit or other qualifying activity, then re-enable the workflow from the repository's **Actions** tab if GitHub has disabled it.

## Point the desktop app at the deployed API

In GitHub repository settings, add or update the repository **Actions variable** `JEVSCHEDULE_API_URL` with the public HTTPS base URL of the API (for example, `https://api.example.org`, without an endpoint path). When set, the release workflow rejects non-HTTPS values; without it, packaged releases use the local server at `http://127.0.0.1:3000`. A non-empty runtime `JEVSCHEDULE_API_URL` overrides the build-time value.
