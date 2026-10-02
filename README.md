# JevSchedule

JevSchedule is a desktop course planner for LSU CSC students. It shows what a student has completed, what they still need, what they are eligible to take next, and helps build a conflict-free weekly schedule.

## Install

Download the installer for your platform from [GitHub Releases](https://github.com/Sweet-Rice/shep4proj/releases):

- Windows: `*.exe` (NSIS installer). If SmartScreen warns, choose **More info → Run anyway**.
- macOS: `*.dmg` or `*.zip`. Builds are unsigned; if Gatekeeper blocks the app, right-click it and choose **Open**.
- Linux: `*.AppImage`.

In v1.0.0, installers connect to a JevSchedule server that you run yourself. The default address is `http://127.0.0.1:3000`; set the `JEVSCHEDULE_API_URL` environment variable to use a different server URL.

To run the server locally, first install the repository dependencies with `pnpm install`, then from the repository root:

```sh
docker compose up -d
pnpm --filter @jevschedule/server db:migrate
pnpm --filter @jevschedule/server db:seed:fixtures
pnpm --filter @jevschedule/server dev
```

The fixture seed provides local sample data. Instead, you can load public catalog and section data using the server's scrape commands; see [the deployment runbook](docs/Deploy.md). Those commands contact live LSU pages.

## Importing your courses

On the Courses tab, start a Workday import to open a visible sign-in window. Sign in through LSU SSO and Duo yourself. JevSchedule reads current-term courses without changing them, shows progress stages, and presents a review before anything is saved. If you prefer, or Workday's page format is not recognized, upload a transcript PDF instead.

## What JevSchedule never does

- It never registers for courses, drops or withdraws from courses, or reserves seats.
- It is read-only toward LSU and Workday.
- It does not provide seat alerts.
- The app runs only while its window is open; it has no tray or background process.

## What stays on your device

Your Workday session, cookies, and raw Workday responses never leave your machine. The app calls only allowlisted, read-only Workday endpoints. Completed courses and your plan are stored in local SQLite on your device. See [SECURITY.md](SECURITY.md) for the data-handling rules.

## The JevSchedule server

The server is the app's one external component. It scrapes public LSU catalog, section, and offering-history data. For v1.0.0, you run the server yourself; there is no hosted production server.

## Repo structure

- `apps/desktop` — Electron main + React renderer (planner and schedule UI)
- `apps/server` — Fastify API + scheduled scraper jobs
- `packages/shared` — types, schemas, and planner logic shared by client and server
- `packages/workday` — Workday response parser + transcript PDF parser (fixture-tested)
- `packages/scraper` — catalog + section parsers (fixture-tested) and the rate-limited catalog fetcher (`pnpm --filter @jevschedule/scraper live-check` runs it against the live site)
- `fixtures` — redacted Workday responses, saved LSU HTML, sample transcripts
- `data/degrees` — hand-encoded degree requirements (YAML), validated by `DegreeProgramSchema` in `packages/shared`

## Dev setup

1. Install [fnm](https://github.com/Schniz/fnm) and use Node 24 LTS:
   ```sh
   fnm install 24
   fnm use 24
   ```
2. Enable Corepack and let it manage pnpm (pinned via `packageManager` in `package.json`):
   ```sh
   corepack enable
   ```
3. Install dependencies:
   ```sh
   pnpm install
   ```
4. Build and test everything:
   ```sh
   pnpm -r build
   pnpm -r test
   ```
5. Start the local Postgres used by the server (needs [Docker](https://docs.docker.com/get-docker/)):
   ```sh
   docker compose up -d        # Postgres 18 on 127.0.0.1:5432, data kept in a named volume
   docker compose down         # stop it (add -v to also delete the data)
   ```
   Defaults work without any setup. To change the user, password, database or port,
   copy `.env.example` to `.env` and edit it.

Other useful root scripts: `pnpm lint`, `pnpm typecheck`, `pnpm format`.

### Windows (PowerShell)

```powershell
winget install Schniz.fnm
fnm env --use-on-cd --shell powershell | Out-String | Invoke-Expression   # also add this line to $PROFILE
fnm install 24; fnm use 24
corepack enable
git clone https://github.com/Sweet-Rice/shep4proj.git; cd shep4proj
pnpm install; pnpm -r build; pnpm -r test
```

- Line endings are forced to LF by `.gitattributes`, so `prettier --check` passes on Windows checkouts. If you cloned before that file existed, run `git rm --cached -r . ; git reset --hard` once.
- The Workday scripts use Microsoft Edge (preinstalled on Windows) first and fall back to Chrome. Nothing extra is needed.
- Workday tooling (log in yourself when the browser opens):
  - `pnpm --filter @jevschedule/workday smoke:login` checks login detection (T-314).
  - `pnpm --filter @jevschedule/workday capture` captures the academic record into `fixtures/workday/raw/` (git-ignored).
  - `pnpm --filter @jevschedule/workday verify:record` parses the newest capture and prints only course codes and counts.

## Documentation

Project plan, architecture, backlog, and data-handling notes live on the
[wiki](https://github.com/Sweet-Rice/shep4proj/wiki), not in this repo.
