import type { HarHeader } from "./har-types.ts";
import { isIdOrTokenSegment } from "./safety.ts";

/** Header names dropped outright regardless of value. */
const DROP_HEADER_NAMES = new Set(["cookie", "set-cookie", "authorization", "proxy-authorization"]);

/** Any header whose *name* matches this is treated as sensitive too. */
export const SENSITIVE_NAME_REGEX = /token|csrf|session|auth|secret|key/i;

/**
 * Query-string parameter names always redacted, beyond `SENSITIVE_NAME_REGEX`
 * - e.g. `clientRequestID`, a per-request correlation id that happens to be
 * a token-shaped GUID/hex string a leftover scan would flag.
 */
const SENSITIVE_QUERY_KEY_REGEX = /token|csrf|session|auth|secret|key|requestid/i;

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
    if (SENSITIVE_QUERY_KEY_REGEX.test(key)) {
      const values = parsed.searchParams.getAll(key);
      parsed.searchParams.delete(key);
      for (const _v of values) {
        parsed.searchParams.append(key, "REDACTED");
      }
    }
  }
  return parsed.toString();
}

/**
 * Redact id/token-shaped path segments in a URL's pathname, keeping the
 * rest of the path structure intact so the request's shape stays
 * intelligible. Uses the same "does this look like an opaque id or token"
 * heuristic as `shortPathSlug` (long, hex, mostly-digit, or base64-ish path
 * segments), so a huge embedded attachment/auth token in the *path* (not
 * just the query string) never ends up stored verbatim in a fixture.
 * Replaced with the literal `TOKEN` rather than angle-bracket punctuation,
 * since the URL is re-serialized and non-path-safe characters would just
 * get percent-encoded.
 */
export function redactUrlPath(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  const segments = parsed.pathname
    .split("/")
    .map((seg) => (seg && isIdOrTokenSegment(seg) ? "TOKEN" : seg));
  parsed.pathname = segments.join("/");
  return parsed.toString();
}

/**
 * Full URL redaction used when storing a fixture: strips token-like path
 * segments and sensitive query-string values, keeping everything else
 * (host, other path words, other query keys) intact.
 */
export function redactUrl(url: string): string {
  return redactQueryString(redactUrlPath(url));
}
