/**
 * Pure, network-free helpers for `inspect-grids.ts` (T-320): filtering HAR
 * entries down to `generic-hub`/`.htmld` JSON responses and rendering their
 * grid structure as plain text lines. Kept separate from the CLI
 * orchestrator so it can be unit tested with synthetic HAR data only (no
 * filesystem, no real capture) — mirrors the `capture-workday.ts` /
 * `capture-lib.ts` split.
 *
 * Prints NO cell values, instance texts, or names — only structure
 * (grid/column/panel labels, row counts, URL paths with token-like
 * segments redacted). See SECURITY.md.
 */
import type { Har, HarEntry } from "../src/redact/har-types.ts";
import { redactUrl } from "../src/redact/headers.ts";
import { findGrids, isPlainObject, type GridCandidate } from "../src/workday-json/find-grids.ts";

/**
 * Track `panelList` context in addition to `panel` — unlike the
 * academic-record parser (which only ever sees `panel`), an unfamiliar
 * response's container widgets aren't known in advance.
 */
const PANEL_WIDGETS = ["panel", "panelList"] as const;

export function isHar(value: unknown): value is Har {
  return (
    typeof value === "object" &&
    value !== null &&
    "log" in value &&
    typeof (value as { log?: unknown }).log === "object" &&
    (value as { log?: unknown }).log !== null &&
    Array.isArray((value as { log: { entries?: unknown } }).log.entries)
  );
}

export function isJsonContentType(entry: HarEntry): boolean {
  const mimeType = entry.response?.content?.mimeType;
  if (typeof mimeType === "string" && mimeType.includes("application/json")) return true;
  const headerContentType = entry.response?.headers?.find(
    (h) => h.name.toLowerCase() === "content-type",
  )?.value;
  return typeof headerContentType === "string" && headerContentType.includes("application/json");
}

/** True if the URL's path (ignoring query) contains `/generic-hub/` or ends in `.htmld`. */
export function isInterestingPath(urlPath: string): boolean {
  return urlPath.includes("/generic-hub/") || urlPath.toLowerCase().endsWith(".htmld");
}

/** The redacted, query-stripped URL path — safe to print (see src/redact). */
export function redactedPathOnly(url: string): string {
  try {
    return new URL(redactUrl(url)).pathname;
  } catch {
    return url;
  }
}

/** `columnId=label` pairs, taken from the column definition or (falling back) any row cell's own `label`. Never a value. */
export function columnLabelPairs(node: Record<string, unknown>): string[] {
  const labelsById = new Map<string, string>();

  const columns = Array.isArray(node.columns) ? node.columns : [];
  for (const col of columns) {
    if (!isPlainObject(col)) continue;
    const id = col.columnId === undefined ? undefined : String(col.columnId);
    const label = typeof col.label === "string" ? col.label : undefined;
    if (id !== undefined && label !== undefined && !labelsById.has(id)) {
      labelsById.set(id, label);
    }
  }

  const rows = Array.isArray(node.rows) ? node.rows : [];
  for (const row of rows) {
    if (!isPlainObject(row)) continue;
    const cellsMap = isPlainObject(row.cellsMap) ? row.cellsMap : {};
    for (const [id, cell] of Object.entries(cellsMap)) {
      if (labelsById.has(id)) continue;
      if (isPlainObject(cell) && typeof cell.label === "string") {
        labelsById.set(id, cell.label);
      }
    }
  }

  return [...labelsById.entries()].map(([id, label]) => `${id}=${label}`);
}

export function gridRowCount(node: Record<string, unknown>): number {
  if (typeof node.rowCount === "number") return node.rowCount;
  return Array.isArray(node.rows) ? node.rows.length : 0;
}

export function panelStackLabels(candidate: GridCandidate): string[] {
  return candidate.panelStack.map((ctx) => {
    const parts: string[] = [];
    if (ctx.label !== undefined) parts.push(`label="${ctx.label}"`);
    if (ctx.title !== undefined) parts.push(`title="${ctx.title}"`);
    const detail = parts.length > 0 ? ` ${parts.join(" ")}` : "";
    return `${ctx.kind}${detail}`;
  });
}

/** Renders one matching HAR entry's grid structure as plain text lines. Returns `[]` for a non-matching or unparsable entry. */
export function formatEntry(entry: HarEntry): string[] {
  const urlPath = redactedPathOnly(entry.request.url);
  if (!isInterestingPath(urlPath) || !isJsonContentType(entry)) return [];

  const bodyText = entry.response?.content?.text;
  if (typeof bodyText !== "string" || bodyText.trim() === "") return [];

  let json: unknown;
  try {
    json = JSON.parse(bodyText);
  } catch {
    return [`${entry.request.method} ${urlPath} — response body is not valid JSON, skipping`];
  }

  const lines: string[] = [`${entry.request.method} ${urlPath}`];

  if (isPlainObject(json) && typeof json.title === "string") {
    lines.push(`  title: ${json.title}`);
  }

  const grids = findGrids(json, "", { panelWidgets: [...PANEL_WIDGETS] });
  if (grids.length === 0) {
    lines.push("  no grid widgets found");
    return lines;
  }

  for (const candidate of grids) {
    const node = candidate.node;
    const label = typeof node.label === "string" ? node.label : "(no label)";
    const rowCount = gridRowCount(node);
    const columns = columnLabelPairs(node);
    const enclosing = panelStackLabels(candidate);

    lines.push(`  grid: label="${label}" rowCount=${rowCount}`);
    lines.push(`    columns: ${columns.length > 0 ? columns.join(", ") : "(none)"}`);
    lines.push(`    enclosing panels: ${enclosing.length > 0 ? enclosing.join(" > ") : "(none)"}`);
  }

  return lines;
}

export interface InspectHarResult {
  /** Lines to print, one HAR entry's block at a time, in encounter order. */
  lines: string[];
  /** Count of entries that matched the URL/content-type filter. */
  matchedCount: number;
}

/** Filters `har`'s entries to `generic-hub`/`.htmld` JSON responses and formats each one. Pure — no I/O, no console output. */
export function inspectHar(har: Har): InspectHarResult {
  const lines: string[] = [];
  let matchedCount = 0;

  for (const entry of har.log.entries) {
    const urlPath = redactedPathOnly(entry.request.url);
    if (!isInterestingPath(urlPath) || !isJsonContentType(entry)) continue;
    matchedCount++;
    lines.push("", ...formatEntry(entry));
  }

  return { lines, matchedCount };
}
