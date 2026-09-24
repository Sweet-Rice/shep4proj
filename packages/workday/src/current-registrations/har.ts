/**
 * Pulls the current-registrations JSON body out of a captured HAR file, so
 * `verify-registrations.ts` (and tests) can feed a real capture into
 * `parseCurrentRegistrations` without the caller having to know Workday's
 * URL shape.
 *
 * Unlike the academic record (whose task id is fixed), the "View My
 * Courses" context id varies per session and the same body has been seen
 * served from either `generic-hub/task/2998$28771.htmld` or
 * `generic-hub/page-context-id/<ctx>.htmld` (see ENDPOINTS.md). So instead
 * of matching a URL pattern, this looks at every JSON response under
 * `/generic-hub/` and picks the one whose body actually contains a grid
 * matching the "My Enrolled Courses" rule (see `parse.ts`'s `classifyGrid`).
 *
 * Per SECURITY.md, HAR files are never committed and this module never
 * inspects anything beyond finding the one matching entry and reading its
 * response body text.
 */
import type { Har, HarEntry } from "../redact/har-types.ts";
import { findGrids, isPlainObject } from "../workday-json/find-grids.ts";
import { WorkdayShapeError } from "./types.ts";

function isJsonContentType(entry: HarEntry): boolean {
  const mimeType = entry.response?.content?.mimeType;
  if (typeof mimeType === "string" && mimeType.includes("application/json")) return true;
  const headerContentType = entry.response?.headers?.find(
    (h) => h.name.toLowerCase() === "content-type",
  )?.value;
  return typeof headerContentType === "string" && headerContentType.includes("application/json");
}

function isHar(value: unknown): value is Har {
  return (
    typeof value === "object" &&
    value !== null &&
    "log" in value &&
    typeof (value as { log?: unknown }).log === "object" &&
    (value as { log?: unknown }).log !== null &&
    Array.isArray((value as { log: { entries?: unknown } }).log.entries)
  );
}

/** True if a "My Enrolled Courses" (or equivalent) grid is found anywhere under `json.body`. */
function bodyHasEnrolledGrid(json: unknown): boolean {
  if (!isPlainObject(json)) return false;
  const body = json.body;
  if (body === undefined) return false;
  const candidates = findGrids(body, "body");
  return candidates.some((candidate) => {
    const columns = Array.isArray(candidate.node.columns) ? candidate.node.columns : [];
    const labels = columns
      .filter(isPlainObject)
      .map((c) => (typeof c.label === "string" ? c.label : undefined))
      .filter((l): l is string => Boolean(l));
    const hasLabel = (label: string): boolean => labels.includes(label);
    if (hasLabel("Dropped/Withdrawn Sections")) return false;
    if (
      typeof candidate.node.label === "string" &&
      candidate.node.label === "My Enrolled Courses"
    ) {
      return true;
    }
    return hasLabel("Course Listing") && hasLabel("Registration Status");
  });
}

/**
 * Finds the HAR entry for "View My Courses" (current-term registrations)
 * and returns its parsed JSON body, ready to pass to
 * `parseCurrentRegistrations`. Doesn't rely on the URL's context id - only
 * on the response actually containing a matching grid.
 */
export function extractCurrentRegistrationsFromHar(har: unknown): unknown {
  if (!isHar(har)) {
    throw new WorkdayShapeError("HAR is missing log.entries", "log.entries");
  }

  for (const entry of har.log.entries) {
    const url = entry?.request?.url;
    if (typeof url !== "string" || !url.includes("/generic-hub/")) continue;
    if (!isJsonContentType(entry)) continue;

    const text = entry.response?.content?.text;
    if (typeof text !== "string") continue;

    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      continue;
    }

    if (bodyHasEnrolledGrid(json)) return json;
  }

  throw new WorkdayShapeError(
    "No current-registrations entry found in HAR (expected a JSON response under " +
      '/generic-hub/ containing a grid matching the "My Enrolled Courses" rule)',
    "log.entries",
  );
}
