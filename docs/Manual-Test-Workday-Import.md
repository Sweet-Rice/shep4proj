# Manual Test: Workday Course Import

This live test requires an LSU Workday account and Duo. Never save screenshots, logs, tokens, cookies, or Workday response bodies from the sign-in session. CI and ordinary manual tests must not contact live Workday.

## Sign-in and session reuse

1. Start JevSchedule and open **Courses**.
2. Select **Start Workday Import**. On a fresh app run, confirm exactly one modal popup opens inside JevSchedule and shows the Microsoft or LSU sign-in page.
3. Confirm the popup has no tabs, address bar, menu bar, developer tools, or right-click context menu. Complete LSU SSO and Duo.
4. Confirm the initial Workday `/lsu/d/...` shell does not close the popup by itself. The app probes `/lsu/app-root` through the popup's session and closes only after the response contains a non-empty session token and client version.
5. Confirm the import fetches the allowlisted course records and reaches review, or shows a clean error with the transcript-PDF fallback. No course is saved until the user confirms the review.
6. Start another import before quitting JevSchedule. Confirm the existing session is reused and no sign-in popup opens while its token is valid.
7. If the session is expired, confirm the app opens one fresh sign-in popup. If a course-data GET returns 401/403, confirm the current attempt is cleared and the importer retries once after fresh sign-in.
8. Close the popup manually during sign-in. Confirm the import becomes cancelled without leaving a popup or hanging progress state. Separately wait for the configured timeout (five minutes by default) and confirm the popup closes.
9. Quit JevSchedule. Confirm its in-memory Workday session is cleared. Restart the app and confirm the next import requires sign-in again.

## Data and privacy checks

- The app-root probe and Academic Record, View My Courses, and Academic Progress reads use the same Electron session and allowlisted GET endpoints.
- Confirm the review contains expected completed and in-progress courses; malformed course data offers the transcript-PDF fallback. An unavailable or malformed Academic Progress response does not block course review.
- Confirm nothing is written before review confirmation. After confirmation, only the reviewed course data is saved.
- The session partition is random and in-memory only, reused until the app exits; cookies, cache, and tokens are never written to disk. Session cookies and cache are cleared on quit or when all windows close.
- Never record or share token/header values, cookies, raw response data, student names/IDs, or Workday URLs containing sensitive query values.
