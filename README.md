# JevSchedule

JevSchedule is a desktop course planner for LSU CSC students. It shows what a student has
completed, what they still need, what they're eligible to take next, and helps build a
conflict-free weekly schedule. See the [project wiki](https://github.com/Sweet-Rice/shep4proj/wiki)
for the full plan, architecture, and backlog.

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

### Manual course completion

Run `pnpm --filter @jevschedule/desktop dev` after building. Enter a course code such as
`CSC 1350`, choose **Show course**, then check or uncheck its completion toggle. Saved
completions appear automatically on launch; both additions and removals survive quitting
and restarting the app. Codes use the shared format: 2–4 letters, a space, and 4 digits.

Marking a searched course complete offers to mark its unmet required prerequisites too.
Choose **Mark All Completed**, **Mark Only** the selected course, or **Cancel** without
saving. OR alternatives are never guessed; manual entries and unmarking do not prompt.

Controls wait for the initial local-store read and disable a course while its write is
pending. A failed write restores its previous state and displays an error. Completion data
stays in the local SQLite store, not on the server. The Courses screen searches the server
catalog; start the server with `pnpm dev` after `db:migrate` and `db:seed:fixtures`. The
manual form remains available for codes outside the catalog. Set `JEVSCHEDULE_API_URL` to
override the default `http://127.0.0.1:3000` server URL.

The desktop renderer opens to the **Courses** screen; use the **Degree progress** tab to view
degree requirements. Only the selected planner screen is mounted. The tab loads the first
degree the server lists (`csc-software-engineering-2026-2027`) and shows an error if the
server is unreachable. Its **Credit-Hour Summary** lists fulfilled and remaining hours per
requirement and in total, using catalog credits (3 per course when the catalog is
unavailable), and recomputes as soon as a course is checked or unchecked.

Degree evaluation assigns courses to explicit requirements before open credit buckets, and
each completed course counts at most once. Requirement results retain the catalog display
order. Fixed groups are **unsatisfied** with no matched courses, **partially satisfied**
with some, and **satisfied** when all are complete.

The **Eligible courses** tab checks every catalog course you have not completed against its
prerequisite tree and sorts it into **Eligible now**, **Needs review** (prerequisite text the
parser could not settle, with a warning instead of a verdict), or **Blocked**, where **Why
blocked?** lists the missing prerequisites. It does not consider planned terms, so a
corequisite reads "completed or planned in the same term". Catalog data is cached for the
session; if the server cannot be reached before it loads, the tab shows an error.

The **Plan** tab maps out future terms. Add a term, pick a catalog course and term, then
choose **Add to plan**; drag a course card (or use its move buttons) to another term. A
course placed before its prerequisites shows an inline **Missing prerequisite** error; only
prerequisites marked as corequisites may be planned in the same term. Each term shows its
credits against the per-term limit (19 by default, LSU's credit-hour maximum) and warns when
it exceeds the limit. Edit the limit with **Credit limit per semester**. The plan and limit
are stored locally and survive restarts; controls stay disabled until the saved plan loads
and while a save is in progress, and a failed save restores the previous plan with an error.

The schedule builder identifies sections by term, course, section number, and type. Conflict
highlights follow the shared meeting-overlap rules, so same-number lecture and lab sections
stay distinct and sections from different terms never conflict.

For production setup, image builds, database migrations, health checks, and the initial live catalog and section scrapes, see the [server deployment runbook](docs/Deploy.md). Set the repository variable `JEVSCHEDULE_API_URL` to the deployed API's HTTPS base URL for release builds.

Release installers require the repository variable `JEVSCHEDULE_API_URL` as their production
API URL and enforce HTTPS. A non-empty runtime `JEVSCHEDULE_API_URL` overrides the build-time
value; local builds without either setting use `http://127.0.0.1:3000`.

Each course in **Courses** has a **When is this offered?** disclosure that fetches its archived
section history on demand and summarizes the Fall, Spring, or Summer terms recorded. Planned
courses warn when their term season has no recorded offerings; an empty archive stays quiet as
history accumulates from semester section scrapes.

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
