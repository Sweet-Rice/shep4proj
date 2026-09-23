# Security and data-handling rules

These are hard rules for this project. They apply to every contributor and every AI agent
working on the codebase, and they take precedence over convenience or speed.

- **Workday session data never leaves the user's machine.** No tokens, cookies, or raw Workday
  responses in logs, error reports, telemetry, or server requests. Only the parsed list of
  completed courses may be sent to the server, and only if a story explicitly requires it.
- **Workday calls are read-only and allowlisted.** Only call endpoints recorded in
  `packages/workday/ENDPOINTS.md`. Never call registration, financial, or profile endpoints.
- **Never commit `.har` files or unredacted Workday responses.** They contain session tokens
  and student PII. Fixtures must be hand-redacted (fake names, fake IDs) before commit.
- **CI never hits live LSU or Workday.** All scraper and parser tests run against saved
  fixtures.
- Reverse-engineering Workday endpoints requires a human with an LSU login capturing traffic in
  DevTools. Do not guess endpoint URLs; ask for captured, redacted samples.
- **AI features get the minimum data, with consent.** The AI advisor (stretch) never receives
  Workday sessions, tokens, raw responses, names, or student IDs. It sees course codes,
  requirements, and stated preferences, and only after the student turns it on. Grades are
  excluded unless the student opts in separately. This applies to every provider.
- **AI suggests, code decides.** Every AI-proposed course or plan is checked by the same
  deterministic `validatePlan`/`isEligible` logic as manual edits before it's shown. The AI
  never writes to the plan directly.

## Reporting

If you find a security or data-handling issue (a leaked secret, a fixture with real student
PII, an endpoint call outside the allowlist, etc.), do not open a public issue. Instead contact
a maintainer directly and describe the issue privately so it can be fixed before disclosure.
