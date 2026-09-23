# Workday endpoint allowlist

## Purpose

This document is the **only** source of truth for which Workday endpoints the
app is allowed to call. Per `SECURITY.md` and the Hard rules in
[[Project-Plan]], Workday calls made from `page.evaluate(fetch(...))` are
**read-only** and **allowlisted**: the app may call an endpoint only if it has
an entry here (Card in `packages/workday/src/allowlist/`) with a matching
`ALLOWED_ENDPOINTS` entry in code.

Nothing here is invented. Every entry is added from a redacted DevTools
capture performed by a human with an LSU login (T-311), never guessed.

## Entry format

Each endpoint gets one entry with the following fields:

- **ID**: short stable identifier, e.g. `academic-record-get`.
- **Purpose**: one sentence describing what data this call reads.
- **Method**: `GET` or `POST`. Workday's internal UI endpoints sometimes use
  `POST` for reads; that alone does not make an endpoint a write.
- **URL pattern**: the URL with tenant/instance-specific segments replaced by
  placeholders, e.g.:
  `https://{tenant}.wd5.myworkday.com/wday/authgwy/{instance}/api/...`
  Never a literal, fully-resolved URL copied from a capture.
- **Required headers**: header *names* only (e.g. `X-Workday-Client`,
  `Accept`), never header values, cookies, or tokens.
- **Redacted fixture path**: path under `/fixtures/workday/` to a
  hand-redacted sample response (fake names, fake IDs, no session data).

Template:

```
### <ID>
- Purpose: <what this reads>
- Method: <GET|POST>
- URL pattern: <pattern with {placeholders}>
- Required headers: <header names, comma-separated>
- Fixture: fixtures/workday/<file>.json
```

## Never allowlist

The following classes of endpoint must never be added to this document or to
`ALLOWED_ENDPOINTS`, regardless of what a capture shows, and are additionally
blocked in code by `DENY_PATTERNS` (see
`packages/workday/src/allowlist/deny-patterns.ts`) so that a mistaken
allowlist entry cannot make them callable:

- **Registration / enrollment**: adding, dropping, swapping, or waitlisting
  sections.
- **Financial / payment**: tuition, billing, payment methods, financial aid
  actions.
- **Profile / personal-info edit**: any endpoint that writes to name,
  address, contact info, emergency contacts, or other personal data.

These are read-*write* or sensitive by nature; this app only ever reads
completed-course history.

## Change process

Editing this file or `ALLOWED_ENDPOINTS` (adding, changing, or removing an
endpoint) requires a pull request reviewed by someone outside Lane A
(Import & security), per the project's cross-lane review rule. The PR
description must link to the DevTools capture or issue that justified the
change.

## Entries

### academic-record-get
- Purpose: Reads the student's academic record — completed/in-progress term
  coursework and transfer credit — the source of truth for completed
  courses. Returned as JSON with a top-level `title`, `widget`, `body`, and
  roughly 70 config keys; courses live in `widget:"grid"` objects labelled
  "Enrollments" (column ids `90.x`: `90.2` Course, `90.5` Grade, `90.6`
  Grade Points, `90.7` Credit Hours, `90.8` Earned Grade Points, `90.1` a row
  descriptor that contains the student's name and ID) plus a Transfer
  Credit grid (`601.x`). Parsed by `parseAcademicRecord` (T-312).
- Method: GET
- URL pattern: `https://www.myworkday.com/lsu/generic-hub/task/2998$30300.htmld?clientRequestID=<uuid>`
- Required headers: `session-secure-token`, `x-workday-client`, `accept`,
  `content-type`, `referer` (plus the session cookie, which
  `page.evaluate(fetch)` sends automatically).
- Fixture: `fixtures/workday/academic-record.synthetic.json` (added by T-312)
- Notes:
  - An equivalent body is also served at
    `GET /lsu/generic-hub/page-context-id/<contextId>.htmld` — same shape,
    different addressing. Both variants are allowlisted.
  - Called by the Workday UI from `https://www.myworkday.com/lsu/d/task/2998$30300.htmld`,
    which is only an HTML shell (~33 KB) — the actual data comes from the
    `generic-hub` call above (~200 KB JSON).
  - `session-secure-token` is session-bound and must never be recorded in a
    fixture or log. The plan is for the app to read it from the page's own
    session context — e.g. from the response of `GET /lsu/app-root`, which
    carries `sessionSecureToken` — **to confirm in implementation** (T-312/T-315).

### Observed but not allowlisted

| Endpoint | Why not |
| --- | --- |
| `GET /lsu/task/2998$30300.htmld` (HUB_NAV) | Navigation-panel metadata for the Academics hub only; carries no course data, so there's nothing here worth the allowlist surface area. |
| `GET /lsu/app-root` | Possibly needed to obtain `sessionSecureToken` for the academic-record call; not yet allowlisted pending confirmation in T-312/T-315 of how the session token is actually sourced. |
| `GET /wday/sirg/protectedapi/asorInternal/v1/lsu/registration` | Registration-related; stays on the deny side per `SECURITY.md` — never allowlist. |

## Pending capture

### Current registrations (T-320)

The academic record grid above lists only graded enrollments — completed,
failed, or withdrawn coursework. It does not include the student's
**current-term registrations** (courses registered for but not yet
graded). The most likely source is the Workday task "View My Courses", but
**its endpoint is unknown and must not be guessed** — per SECURITY.md, a
human with an LSU login has to capture it first.

Steps to capture and inspect it once available:

1. Run `pnpm --filter @jevschedule/workday capture --pii "..."`. After the
   academic record loads, the script now prompts: open View My Courses by
   typing it into the Workday search bar, pick the task, and wait for
   current courses to show, then press Enter.
2. Run `pnpm --filter @jevschedule/workday inspect:grids` against the
   resulting HAR (defaults to the newest file in `fixtures/workday/raw/`)
   to see the response's structure — grid labels, row counts, and
   `columnId=label` pairs, with no cell values, instance text, or names
   printed.
3. Once the endpoint is confirmed, add it as a new entry here (see "Entry
   format" above) and a parser can be built against it. Until then, no code
   may call it.
4. If the URL is already known on a later run, pass it via `--task-url
   <url>` to `capture` so the script navigates there automatically instead
   of relying on manual search.

## How this was captured

Endpoints in this document come from a redacted DevTools capture performed
by a human with an LSU login, run via `pnpm --filter @jevschedule/workday
capture`. See the wiki's Workday-Capture-Guide for the full capture
procedure.
