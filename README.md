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
- `packages/scraper` — catalog + section parsers (fixture-tested)
- `fixtures` — redacted Workday responses, saved LSU HTML, sample transcripts

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

Other useful root scripts: `pnpm lint`, `pnpm typecheck`, `pnpm format`.

## Documentation

Project plan, architecture, backlog, and data-handling notes live on the
[wiki](https://github.com/Sweet-Rice/shep4proj/wiki), not in this repo.
