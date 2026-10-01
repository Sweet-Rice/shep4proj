# Manual Test: Workday Transcript Import Checklist

This checklist documents the manual testing procedures and verification results for direct Workday transcript import and fallback review across target desktop operating systems (Windows and macOS).

## Target Operating Systems

- **Windows**: Windows 11 x64 (Build 22631)
- **macOS**: macOS Sequoia / Sonoma (Apple Silicon arm64 & Intel x64)

## Test Verification Matrix

| Step | Verification Item | Windows 11 Status | macOS Status | Notes |
| :--- | :--- | :---: | :---: | :--- |
| 1 | Workday Credential Sign-in & Authentication | **PASS** | **PASS** | Session tokens securely stored in `safeStorage`. |
| 2 | Direct Academic Record Fetch (`GET /academic-record`) | **PASS** | **PASS** | Endpoint fetch wrapped with allowlist guard. |
| 3 | Import Review Screen Display | **PASS** | **PASS** | Renders checklist of parsed courses, grades, and terms. |
| 4 | Unrecognized Lines Handling | **PASS** | **PASS** | Unmatched lines listed in dedicated review panel. |
| 5 | Course Confirmation & SQLite Local Store Writing | **PASS** | **PASS** | Selected courses persisted to `completed_courses` table. |
| 6 | Fallback Upload Trigger on Connection Error | **PASS** | **PASS** | "Upload Transcript Instead" fallback reachable. |

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
