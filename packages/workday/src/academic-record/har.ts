/**
 * Pulls the academic-record JSON body out of a captured HAR file, so the
 * verify-record script (and tests) can feed a real capture into
 * `parseAcademicRecord` without the caller having to know Workday's URL
 * shape.
 *
 * Per SECURITY.md, HAR files are never committed and this module never
 * inspects anything beyond finding the one matching entry and reading its
 * response body text.
 */
import type { Har, HarEntry } from "../redact/har-types.ts";
import { WorkdayShapeError } from "./types.ts";

const TARGET_URL_PATTERNS = [
  /\/generic-hub\/task\/2998\$30300\.htmld/,
  /\/generic-hub\/page-context-id\//,
];

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

/**
 * Finds the HAR entry for the "View My Academic Record" response and
 * returns its parsed JSON body, ready to pass to `parseAcademicRecord`.
 */
export function extractFromHar(har: unknown): unknown {
  if (!isHar(har)) {
    throw new WorkdayShapeError("HAR is missing log.entries", "log.entries");
  }

  const entry = har.log.entries.find((e) => {
    const url = e?.request?.url;
    if (typeof url !== "string") return false;
    if (!TARGET_URL_PATTERNS.some((re) => re.test(url))) return false;
    return isJsonContentType(e);
  });

  if (!entry) {
    throw new WorkdayShapeError(
      "No academic-record entry found in HAR (expected a JSON response under /generic-hub/task/2998$30300.htmld or /generic-hub/page-context-id/)",
      "log.entries",
    );
  }

  const text = entry.response?.content?.text;
  if (typeof text !== "string") {
    throw new WorkdayShapeError(
      "Matching HAR entry has no response body text",
      "log.entries[].response.content.text",
    );
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new WorkdayShapeError(
      "Matching HAR entry response body is not valid JSON",
      "log.entries[].response.content.text",
    );
  }
}
