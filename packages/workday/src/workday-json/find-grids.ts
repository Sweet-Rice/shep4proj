/**
 * Shared recursive walker for Workday's generic-hub JSON UI descriptors:
 * finds every `widget: "grid"` object nested anywhere under a root node,
 * tracking the stack of enclosing `panel`-like widgets (label/title) along
 * the way.
 *
 * Extracted from the academic-record parser (T-312) so that other tooling
 * — notably `scripts/inspect-grids.ts` (T-320), which dumps grid structure
 * for an unknown response shape without knowing where the grids live —
 * can reuse the exact same traversal instead of duplicating it. The
 * academic-record parser's own behavior is unchanged: it still walks only
 * `panel` widgets, starting from `body`.
 */

/** Grid-level scratch keys that duplicate a row; never read them. */
const IGNORED_GRID_SCRATCH_KEYS = new Set(["maxLengthValueRow", "maxWordLengthValueRow"]);

/** Widget names that count as "panel-like" containers by default. */
const DEFAULT_PANEL_WIDGETS: readonly string[] = ["panel"];

export interface PanelContext {
  /** The widget name that produced this context, e.g. "panel" or "panelList". */
  kind: string;
  label?: string;
  title?: string;
}

export interface GridCandidate {
  node: Record<string, unknown>;
  path: string;
  panelStack: PanelContext[];
}

export interface FindGridsOptions {
  /**
   * Widget names whose nodes push a `PanelContext` onto the stack as the
   * walk descends into them. Defaults to `["panel"]`, matching the
   * academic-record parser's original behavior. Pass `["panel",
   * "panelList"]` to also capture `panelList` context (used by
   * `inspect-grids.ts`, which doesn't know in advance which container
   * widgets an unfamiliar response uses).
   */
  panelWidgets?: readonly string[];
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Recursively finds every `widget: "grid"` object under `node`, returning
 * each with its JSON path and the stack of enclosing panel-like contexts
 * (outermost first). Does not descend into a grid once found (grids are
 * not nested inside each other in practice), and skips
 * `maxLengthValueRow`/`maxWordLengthValueRow` scratch keys entirely.
 */
export function findGrids(
  node: unknown,
  path = "",
  options: FindGridsOptions = {},
): GridCandidate[] {
  const panelWidgets = new Set(options.panelWidgets ?? DEFAULT_PANEL_WIDGETS);
  const out: GridCandidate[] = [];
  collect(node, path, [], panelWidgets, out);
  return out;
}

function collect(
  node: unknown,
  path: string,
  panelStack: PanelContext[],
  panelWidgets: Set<string>,
  out: GridCandidate[],
): void {
  if (Array.isArray(node)) {
    node.forEach((item, index) =>
      collect(item, `${path}[${index}]`, panelStack, panelWidgets, out),
    );
    return;
  }
  if (!isPlainObject(node)) return;

  if (node.widget === "grid") {
    out.push({ node, path, panelStack: [...panelStack] });
    return;
  }

  let nextStack = panelStack;
  if (typeof node.widget === "string" && panelWidgets.has(node.widget)) {
    const ctx: PanelContext = { kind: node.widget };
    if (typeof node.label === "string") ctx.label = node.label;
    if (typeof node.title === "string") ctx.title = node.title;
    nextStack = [...panelStack, ctx];
  }

  for (const [key, value] of Object.entries(node)) {
    if (IGNORED_GRID_SCRATCH_KEYS.has(key)) continue;
    collect(value, path ? `${path}.${key}` : key, nextStack, panelWidgets, out);
  }
}
