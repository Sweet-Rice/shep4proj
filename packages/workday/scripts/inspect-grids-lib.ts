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

/** Cell-shape dump. String values are represented only by length, except course codes. */
function valueShape(value: unknown): string {
  if (typeof value === "string") {
    return /^[A-Z]{2,4} \d{4}[A-Z]{0,2}$/.test(value) ? JSON.stringify(value) : `<string len=${value.length}>`;
  }
  if (value === null) return "null";
  if (Array.isArray(value)) return `array(len=${value.length})`;
  if (typeof value === "object") return "object";
  return typeof value;
}

function renderCell(value: unknown, indent: string, seen: Set<object>): string[] {
  if (!isPlainObject(value)) return [`${indent}${valueShape(value)}`];
  if (seen.has(value)) return [`${indent}object (cycle)`];
  seen.add(value);
  const lines = [`${indent}keys: ${Object.keys(value).sort().join(", ") || "(none)"}`];
  for (const [key, child] of Object.entries(value)) {
    if (key === "text" || key === "value") lines.push(`${indent}${key}: ${valueShape(child)}`);
    else if (Array.isArray(child)) {
      lines.push(`${indent}${key}: array(len=${child.length})`);
      for (const item of child) lines.push(...renderCell(item, `${indent}  `, seen));
    } else if (isPlainObject(child)) {
      lines.push(`${indent}${key}: object`);
      lines.push(...renderCell(child, `${indent}  `, seen));
    } else lines.push(`${indent}${key}: ${valueShape(child)}`);
  }
  seen.delete(value);
  return lines;
}

function formatCellsEntry(entry: HarEntry): string[] {
  const urlPath = redactedPathOnly(entry.request.url);
  if (!isInterestingPath(urlPath) || !isJsonContentType(entry)) return [];
  const bodyText = entry.response?.content?.text;
  if (typeof bodyText !== "string" || bodyText.trim() === "") return [];
  let json: unknown;
  try { json = JSON.parse(bodyText); } catch { return []; }
  const lines = [`${entry.request.method} ${urlPath}`];
  for (const candidate of findGrids(json, "", { panelWidgets: [...PANEL_WIDGETS] })) {
    const node = candidate.node;
    lines.push(`  grid: ${typeof node.label === "string" ? node.label : "(no label)"} rows=${gridRowCount(node)}`);
    const columns = Array.isArray(node.columns) ? node.columns : [];
    const rows = Array.isArray(node.rows) ? node.rows : [];
    for (const column of columns) {
      if (!isPlainObject(column) || typeof column.columnId !== "string") continue;
      lines.push(`    column ${column.columnId} ${typeof column.label === "string" ? column.label : "(no label)"}`);
      for (const row of rows) {
        if (!isPlainObject(row) || !isPlainObject(row.cellsMap)) continue;
        const cell = row.cellsMap[column.columnId];
        if (cell !== undefined) lines.push(...renderCell(cell, `      row ${String(row.rowIndex)}: `, new Set()));
      }
    }
  }
  return lines;
}

/** Renders one matching HAR entry's grid structure as plain text lines. Returns `[]` for a non-matching or unparsable entry. */
export function formatEntry(entry: HarEntry, cells = false): string[] {
  if (cells) return formatCellsEntry(entry);
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
  if (isPlainObject(json) && typeof json.title === "string") lines.push(`  title: ${json.title}`);
  const grids = findGrids(json, "", { panelWidgets: [...PANEL_WIDGETS] });
  if (grids.length === 0) {
    lines.push("  no grid widgets found");
    return lines;
  }
  for (const candidate of grids) {
    const node = candidate.node;
    const label = typeof node.label === "string" ? node.label : "(no label)";
    const columns = columnLabelPairs(node);
    const enclosing = panelStackLabels(candidate);
    lines.push(`  grid: label="${label}" rowCount=${gridRowCount(node)}`);
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

/** Filters and formats matching HAR responses. */
export function inspectHar(har: Har, options: { cells?: boolean; pathContains?: string } = {}): InspectHarResult {
  const lines: string[] = [];
  let matchedCount = 0;
  for (const entry of har.log.entries) {
    const urlPath = redactedPathOnly(entry.request.url);
    if (!isInterestingPath(urlPath) || !isJsonContentType(entry) || (options.pathContains && !urlPath.includes(options.pathContains))) continue;
    matchedCount++;
    lines.push("", ...formatEntry(entry, options.cells));
  }
  return { lines, matchedCount };
}

