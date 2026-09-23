import type { AllowedEndpoint } from "./types.js";

/**
 * The Workday endpoints this app is allowed to call. Populated by T-311 from
 * a human's redacted DevTools capture (see `packages/workday/ENDPOINTS.md`)
 * — never guessed or invented here.
 *
 * Every call is additionally checked against `DENY_PATTERNS`, so even a
 * mistaken entry for a registration/financial/profile-edit endpoint would
 * still be rejected.
 */
export const ALLOWED_ENDPOINTS: readonly AllowedEndpoint[] = [
  {
    id: "academic-record-get",
    method: "GET",
    // Matches both the `task/2998$30300.htmld` and the equivalent
    // `page-context-id/<contextId>.htmld` variant. See ENDPOINTS.md for the
    // full write-up, including the `clientRequestID` query parameter.
    pattern:
      /^https:\/\/www\.myworkday\.com\/lsu\/generic-hub\/(task\/2998\$30300|page-context-id\/[A-Za-z0-9]+)\.htmld(\?.*)?$/,
    description:
      "Read the student's academic record (completed/in-progress coursework and transfer credit).",
  },
];
