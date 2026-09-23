/**
 * Pure, network-free helpers for `capture-workday.ts` (T-311): the host
 * allowlist check used to decide what traffic to record, response
 * classification, and picking the entry most likely to carry the academic
 * record out of a capture. Kept separate from the CLI orchestrator so they
 * can be unit tested with synthetic data only (no Playwright, no real HAR).
 */

/** Task id fragment for "View My Academic Record" (see wiki Data-Sources.md). */
export const ACADEMIC_RECORD_TASK_ID = "2998$30300";

/**
 * True if `hostname` is `myworkday.com` or any subdomain of it. Used to
 * decide what traffic is worth recording/keeping — anything else (CDNs,
 * analytics, unrelated third parties) is dropped.
 */
export function isWorkdayHost(hostname: string): boolean {
  const h = hostname.trim().toLowerCase();
  if (!h) return false;
  return h === "myworkday.com" || h.endsWith(".myworkday.com");
}

/**
 * Equivalent of `isWorkdayHost`, expressed as a RegExp so it can be handed
 * to Playwright's `recordHar.urlFilter`. Requires the host to end exactly
 * in `myworkday.com` (dot-bounded), so `evilmyworkday.com` does not match.
 */
export const WORKDAY_HAR_URL_FILTER =
  /^https:\/\/(?:[a-z0-9-]+\.)*myworkday\.com(?::\d+)?(?:\/|$)/i;

export type ResponseClass = "json" | "html" | "other";

/**
 * Classifies a response body without any DOM parser: `json` if it parses
 * as JSON, `html` if (after leading whitespace) it starts with `<!DOCTYPE`
 * or `<html`, otherwise `other`. Deliberately ignores the declared
 * `mimeType` — Workday is not always consistent about it.
 */
export function classifyResponse(bodyText: string | null | undefined): ResponseClass {
  const text = bodyText ?? "";
  const trimmed = text.trimStart();
  if (trimmed === "") return "other";

  try {
    JSON.parse(text);
    return "json";
  } catch {
    // not JSON; fall through
  }

  if (/^<!DOCTYPE/i.test(trimmed) || /^<html/i.test(trimmed)) {
    return "html";
  }

  return "other";
}

/**
 * Returns the top-level key names of a JSON body, never its values.
 * - object -> its own keys.
 * - array -> a single `array(<length>)` marker (no per-element keys).
 * - anything else that still parses (string/number/bool/null) -> `[]`.
 * Returns `null` if `text` does not parse as JSON at all.
 */
export function jsonTopLevelKeys(text: string): string[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }

  if (Array.isArray(parsed)) {
    return [`array(${parsed.length})`];
  }
  if (parsed !== null && typeof parsed === "object") {
    return Object.keys(parsed as Record<string, unknown>);
  }
  return [];
}

export interface RecordCandidate {
  /** URL path (and optionally query), never the full origin+path+secrets. */
  urlPath: string;
  classification: ResponseClass;
  /** Size in bytes of the (redacted) response body. */
  bytes: number;
  /** True if this entry was captured after navigating to the academic-record task. */
  afterNavigation: boolean;
}

/**
 * Picks the capture entry most likely to carry the academic record data:
 * 1. Any entry whose URL path contains the academic-record task id
 *    (`2998$30300`) wins outright — it's a direct signal.
 * 2. Otherwise, the largest JSON response captured after navigating to the
 *    academic-record task.
 * Returns `undefined` if nothing matches either heuristic.
 */
export function pickLikelyRecordEntry<T extends RecordCandidate>(
  entries: readonly T[],
): T | undefined {
  const taskMatch = entries.find((e) => e.urlPath.includes(ACADEMIC_RECORD_TASK_ID));
  if (taskMatch) return taskMatch;

  let best: T | undefined;
  for (const entry of entries) {
    if (entry.classification !== "json" || !entry.afterNavigation) continue;
    if (!best || entry.bytes > best.bytes) {
      best = entry;
    }
  }
  return best;
}
