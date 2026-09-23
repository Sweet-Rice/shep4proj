import type { AllowedEndpoint } from "./types.js";

/**
 * The Workday endpoints this app is allowed to call. Empty until T-311
 * records real endpoint patterns from a human's redacted DevTools capture
 * (see `packages/workday/ENDPOINTS.md`) — never guessed or invented here.
 *
 * Every call is additionally checked against `DENY_PATTERNS`, so even a
 * mistaken entry for a registration/financial/profile-edit endpoint would
 * still be rejected.
 */
export const ALLOWED_ENDPOINTS: readonly AllowedEndpoint[] = [];
