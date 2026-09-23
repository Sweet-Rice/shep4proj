/**
 * Generic keyword patterns that are always denied, even if a matching URL
 * somehow ends up in `ALLOWED_ENDPOINTS` by mistake. These are deliberately
 * generic English keywords, not guesses at real Workday URLs — the actual
 * endpoint list is populated later by T-311 from a redacted capture.
 *
 * Covers the "Never allowlist" categories from `ENDPOINTS.md`: registration
 * / enrollment, financial / payment, and profile / personal-info edits.
 */
export const DENY_PATTERNS: readonly RegExp[] = [
  /regist/i,
  /enroll/i,
  /drop/i,
  /payment/i,
  /financ/i,
  /bank/i,
  /tax/i,
  /address/i,
  /profile.*edit/i,
];
