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
  - This `page-context-id/<contextId>` pattern is **generic**: it isn't tied
    to task 2998$30300, and the same `ALLOWED_ENDPOINTS` entry (regex
    alternation) also covers `current-registrations-get` below, since both
    tasks have been observed served from a `page-context-id` URL in
    practice, with the context id varying per session. There is no separate
    `page-context-id` allowlist entry — it's shared between the two.
  - Called by the Workday UI from `https://www.myworkday.com/lsu/d/task/2998$30300.htmld`,
    which is only an HTML shell (~33 KB) — the actual data comes from the
    `generic-hub` call above (~200 KB JSON).
  - `session-secure-token` is session-bound and must never be recorded in a
    fixture or log. The plan is for the app to read it from the page's own
    session context — e.g. from the response of `GET /lsu/app-root`, which
    carries `sessionSecureToken` — **to confirm in implementation** (T-312/T-315).

### current-registrations-get
- Purpose: Reads the student's current-term registrations ("View My
  Courses") — enrolled courses with their section(s), and dropped/withdrawn
  sections. The academic record above only lists *graded* coursework, so
  this is the only source for in-progress registrations. Returned as JSON
  with a top-level `title`/`widget`/`body`; enrolled courses live in a
  `widget:"grid"` labelled "My Enrolled Courses" (course-level column ids
  observed as `262.x`: `262.2` Course Listing, `262.10` Credit Hours,
  `262.11` Grading Basis, `262.12` Enrolled Sections; section-level column
  ids observed as `256.x`: `256.1` Section, `256.2` Registration Status,
  `256.6` Instructional Format, `256.7` Delivery Mode, `256.8` Meeting
  Patterns, `256.9` Instructor, `256.10` Start Date, `256.11` End Date).
  Dropped/withdrawn sections live in a second, unlabeled grid identified by
  a "Dropped/Withdrawn Sections" column (`485.x`/`479.x` in the observed
  capture). Parsed by `parseCurrentRegistrations` (T-320).
- Method: GET
- URL pattern: `https://www.myworkday.com/lsu/generic-hub/task/2998$28771.htmld?clientRequestID=<uuid>`
  (**to confirm** — task 2998$28771 is the "View My Courses" task id
  observed via `HUB_NAV` at `GET /lsu/task/2998$28771.htmld`, by analogy
  with the academic record's `task/2998$30300` → `d/task/2998$30300`
  pairing; the exact `generic-hub/task/...` URL for this task has not
  itself been directly captured, only its `page-context-id` equivalent —
  see below.)
- Required headers: same as `academic-record-get` — `session-secure-token`,
  `x-workday-client`, `accept`, `content-type`, `referer` (plus the session
  cookie).
- Fixture: `fixtures/workday/current-registrations.synthetic.json` (added
  by T-320)
- Notes:
  - Observed in practice served at
    `GET /lsu/generic-hub/page-context-id/<contextId>.htmld` — the same
    shared, generic pattern already allowlisted by `academic-record-get`
    above (context id varies per session; not tied to either task). See
    `extractCurrentRegistrationsFromHar`, which picks the matching HAR
    entry by grid content rather than by URL, precisely because the context
    id can't be relied on.
  - `2998$28771` contains neither `regist` nor `drop`, so it isn't
    incidentally caught by `DENY_PATTERNS` (which target the registration
    *write* APIs, not this read-only task id) — verified by a dedicated
    allowlist test.

### Observed but not allowlisted

| Endpoint | Why not |
| --- | --- |
| `GET /lsu/task/2998$30300.htmld` (HUB_NAV) | Navigation-panel metadata for the Academics hub only; carries no course data, so there's nothing here worth the allowlist surface area. |
| `GET /lsu/task/2998$28771.htmld` (HUB_NAV) | Same as above, for "View My Courses" — navigation-panel metadata only, no grid data. |
| `GET /lsu/app-root` | Possibly needed to obtain `sessionSecureToken` for the academic-record call; not yet allowlisted pending confirmation in T-312/T-315 of how the session token is actually sourced. |
| `GET /wday/sirg/protectedapi/asorInternal/v1/lsu/registration` | Registration-related; stays on the deny side per `SECURITY.md` — never allowlist. |

## How this was captured

Endpoints in this document come from a redacted DevTools capture performed
by a human with an LSU login, run via `pnpm --filter @jevschedule/workday
capture`. See the wiki's Workday-Capture-Guide for the full capture
procedure.
