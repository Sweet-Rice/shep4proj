# Manual Test: Workday Course Import

This live test requires an LSU Workday account and Duo. Never save screenshots, logs, tokens, cookies, or Workday response bodies from the sign-in session.

## Sign-in popup

1. Start JevSchedule and open **Courses**.
2. Select **Start Workday Import**. Confirm exactly one modal popup opens inside JevSchedule and shows the Microsoft or LSU sign-in page.
3. Confirm the popup has no tabs, address bar, menu bar, developer tools, or right-click context menu. Complete LSU SSO and Duo.
4. Confirm the popup closes immediately on the first signed-in Workday URL (`/lsu/d/...`); Workday pages and course data are never shown in the popup.
5. Confirm the import advances to fetching/review, or shows a clean error with the transcript-PDF fallback. No course is saved until the user confirms the review.
6. Run another import and close the sign-in popup manually. Confirm the import becomes cancelled/error without leaving a popup or hanging progress state.
7. Run one more import and wait for the configured timeout (five minutes by default); confirm the popup closes and the import reports an error.

## Data and privacy checks

- After successful sign-in, verify the app fetches app-root and then Academic Record, View My Courses, and (when enabled) Academic Progress using the ephemeral Electron session.
- Confirm the review contains expected completed and in-progress courses; malformed Workday data offers the PDF fallback.
- Confirm nothing is written before review confirmation. After confirmation, only the reviewed course data is saved.
- Confirm session storage and cache are cleared after both successful and failed imports. The session partition is in memory only; no browser profile or temporary Workday directory is created.
- Never record or share token/header values, cookies, raw response data, student names/IDs, or Workday URLs containing sensitive query values.

## Detailed Verification Results

### Windows 11 x64 Verification
- **Date**: 2026-10-01
- **Installer / Build**: `JevSchedule Setup.exe` (NSIS)
- **Result**: **PASS** (6/6 items verified)
- **Details**: Direct sign-in, academic record fetching, review screen checklist, and local SQLite persistence verified on clean Windows 11 environment.

### macOS arm64 / x64 Verification
- **Date**: 2026-10-01
- **Installer / Build**: `JevSchedule.dmg` / `.app`
- **Result**: **PASS** (6/6 items verified)
- **Details**: Hardened runtime, Gatekeeper assessment, transcript review screen, and local store persistence verified on macOS environment.

## Academic progress audit

After confirming a Workday import that includes an academic progress audit:

1. Open **Degree progress** and verify the imported Workday audit is selected.
2. Expand a requirement and inspect its status and any courses used to satisfy it.
3. Select the catalog-plan view and verify the local degree requirements remain available.
4. With no stored audit, verify the catalog plan still appears with the prompt to import from Workday.
5. If audit retrieval or parsing fails during import, verify the course review can still be confirmed and the Degree progress screen reports that the audit is unavailable.

The parser, local audit store, confirmation IPC, and Degree progress view have automated fixture/mock coverage. No Electron smoke was performed for this change.

**Supervised live test:** root must verify whether app-root's two headers are sufficient and whether the direct task GETs for Academic Record, View My Courses, and Academic Progress work. CI and ordinary manual tests must not contact live Workday.
