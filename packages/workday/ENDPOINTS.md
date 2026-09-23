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

_(populated by T-311 — no endpoints are allowlisted yet)_
