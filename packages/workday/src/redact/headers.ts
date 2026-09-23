import type { HarHeader } from "./har-types.ts";

/** Header names dropped outright regardless of value. */
const DROP_HEADER_NAMES = new Set(["cookie", "set-cookie", "authorization", "proxy-authorization"]);

/** Any header whose *name* matches this is treated as sensitive too. */
export const SENSITIVE_NAME_REGEX = /token|csrf|session|auth|secret|key/i;

export function isSensitiveHeaderName(name: string): boolean {
  return DROP_HEADER_NAMES.has(name.toLowerCase()) || SENSITIVE_NAME_REGEX.test(name);
}

/**
 * We never keep header *values* in redactor output - only the names of the
 * headers that were present, so a reviewer can see the shape of a request
 * without any chance of a cookie/token value leaking into a fixture.
 */
export function headerNames(headers: HarHeader[] | undefined): string[] {
  if (!headers) return [];
  return headers.map((h) => h.name);
}

/**
 * Redact sensitive query-string parameter values in a URL, keeping the
 * parameter names so the shape of the request stays intelligible.
 */
export function redactQueryString(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  for (const key of Array.from(parsed.searchParams.keys())) {
    if (SENSITIVE_NAME_REGEX.test(key)) {
      const values = parsed.searchParams.getAll(key);
      parsed.searchParams.delete(key);
      for (const _v of values) {
        parsed.searchParams.append(key, "REDACTED");
      }
    }
  }
  return parsed.toString();
}
