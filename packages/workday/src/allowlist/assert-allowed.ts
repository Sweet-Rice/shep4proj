import { ALLOWED_ENDPOINTS } from "./allowed-endpoints.js";
import { DENY_PATTERNS } from "./deny-patterns.js";
import { EndpointNotAllowedError } from "./errors.js";
import type { AllowedEndpoint, HttpMethod } from "./types.js";

/**
 * Throws `EndpointNotAllowedError` unless `method` + `url` matches an entry
 * in `list` (default `ALLOWED_ENDPOINTS`) by method and URL pattern, and
 * doesn't match any `DENY_PATTERNS` keyword. Deny patterns win even over an
 * allowlist match, so a mistaken allowlist entry can't reopen a
 * registration/financial/profile-edit endpoint.
 */
export function assertAllowed(
  method: HttpMethod,
  url: string,
  list: readonly AllowedEndpoint[] = ALLOWED_ENDPOINTS,
): void {
  for (const pattern of DENY_PATTERNS) {
    if (pattern.test(url)) {
      throw new EndpointNotAllowedError(method, url, "matches a denied pattern");
    }
  }

  const isAllowed = list.some((entry) => entry.method === method && entry.pattern.test(url));

  if (!isAllowed) {
    throw new EndpointNotAllowedError(method, url, "not in the endpoint allowlist");
  }
}
