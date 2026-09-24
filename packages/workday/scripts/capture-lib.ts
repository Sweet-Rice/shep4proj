/**
 * Pure, network-free helpers for `capture-workday.ts` (T-311/T-320): the
 * host allowlist check used to decide what traffic to record, response
 * classification, and picking the entries most likely to carry the
 * academic record and the current-term registrations out of a capture.
 * Kept separate from the CLI orchestrator so they can be unit tested with
 * synthetic data only (no Playwright, no real HAR).
 */
import { findGrids, isPlainObject } from "../src/workday-json/find-grids.ts";

/** Task id fragment for "View My Academic Record" (see wiki Data-Sources.md). */
export const ACADEMIC_RECORD_TASK_ID = "2998$30300";

/** Task id fragment for "View My Courses" (see ENDPOINTS.md). */
export const CURRENT_REGISTRATIONS_TASK_ID = "2998$28771";

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
  /** The (redacted) response body text, used to look for grid content. Null if unavailable. */
  bodyText: string | null;
}

/** A grid's label and its columns' labels, with no row/cell data - used only to classify *which* grid this is. */
export interface GridSummary {
  label: string | undefined;
  columnLabels: string[];
}

/**
 * Extracts every `widget:"grid"` found anywhere under `json.body`, as
 * label-only summaries - never row or cell content. Returns `[]` for a
 * non-JSON body, a JSON body with no `body` key, or a body with no grids.
 */
export function extractGridSummaries(bodyText: string | null): GridSummary[] {
  if (!bodyText) return [];
  let json: unknown;
  try {
    json = JSON.parse(bodyText);
  } catch {
    return [];
  }
  if (!isPlainObject(json)) return [];
  const body = json.body;
  if (body === undefined) return [];

  return findGrids(body, "body").map((candidate) => {
    const columns = Array.isArray(candidate.node.columns) ? candidate.node.columns : [];
    const columnLabels = columns
      .filter(isPlainObject)
      .map((c) => (typeof c.label === "string" ? c.label : undefined))
      .filter((l): l is string => Boolean(l));
    return {
      label: typeof candidate.node.label === "string" ? candidate.node.label : undefined,
      columnLabels,
    };
  });
}

/** True if `summary` looks like the academic record's "Enrollments" grid. */
export function isAcademicRecordGrid(summary: GridSummary): boolean {
  if (summary.label === "Enrollments") return true;
  return summary.columnLabels.includes("Course") && summary.columnLabels.includes("Grade Points");
}

/** True if `summary` looks like the current-registrations "My Enrolled Courses" grid. */
export function isCurrentRegistrationsGrid(summary: GridSummary): boolean {
  if (summary.label === "My Enrolled Courses") return true;
  return (
    summary.columnLabels.includes("Course Listing") &&
    summary.columnLabels.includes("Registration Status")
  );
}

/**
 * Picks the capture entry most likely to carry a grid matching `matches`:
 * the largest JSON response (by redacted body size) whose body contains at
 * least one matching grid. Never picks an HTML (or non-JSON) response, even
 * if its URL looks promising - only actual grid content counts. Returns
 * `undefined` if nothing matches.
 */
function pickLikelyGridEntry<T extends RecordCandidate>(
  entries: readonly T[],
  matches: (summary: GridSummary) => boolean,
): T | undefined {
  let best: T | undefined;
  for (const entry of entries) {
    if (entry.classification !== "json") continue;
    const summaries = extractGridSummaries(entry.bodyText);
    if (!summaries.some(matches)) continue;
    if (!best || entry.bytes > best.bytes) {
      best = entry;
    }
  }
  return best;
}

/**
 * Picks the capture entry most likely to carry the academic record: the
 * largest JSON response under `/generic-hub/` whose body contains an
 * "Enrollments"-shaped grid. Never an HTML shell like
 * `/lsu/d/task/2998$30300.htmld`, even though its URL names the right task
 * id - only a response that actually contains the grid data counts.
 */
export function pickLikelyAcademicRecordEntry<T extends RecordCandidate>(
  entries: readonly T[],
): T | undefined {
  return pickLikelyGridEntry(entries, isAcademicRecordGrid);
}

/**
 * Picks the capture entry most likely to carry the current-term
 * registrations: the largest JSON response whose body contains a
 * "My Enrolled Courses"-shaped grid (see ENDPOINTS.md / T-320). Named and
 * picked independently of `pickLikelyAcademicRecordEntry` so a capture that
 * includes both tasks reports each one correctly instead of only the
 * first/largest overall.
 */
export function pickLikelyRegistrationsEntry<T extends RecordCandidate>(
  entries: readonly T[],
): T | undefined {
  return pickLikelyGridEntry(entries, isCurrentRegistrationsGrid);
}
