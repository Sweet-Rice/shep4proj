/**
 * Parser for the Workday "View My Courses" (current-term registrations)
 * JSON response.
 *
 * The real response shape was never captured (see ENDPOINTS.md "Pending
 * capture" / T-320 at the time this was written) - only its *structure*
 * (grid labels, row counts, column id/label pairs) was observed via
 * `inspect:grids` against a real capture, never any cell value. This parser
 * is therefore written defensively, tolerating several plausible cell
 * shapes rather than assuming one, and is expected to need adjustment once
 * a human verifies it against real (never-committed) data - see the
 * `verify:registrations` script.
 *
 * Structure observed:
 *  - Grid "My Enrolled Courses": one row per course, with course-level
 *    columns (id prefix e.g. `262.x`: Course Listing, Credit Hours, Grading
 *    Basis, Enrolled Sections) and section-level columns (id prefix e.g.
 *    `256.x`: Section, Instructional Format, Delivery Mode, Meeting
 *    Patterns, Instructor, Start Date, End Date, Registration Status).
 *    A course with multiple sections (e.g. lecture + lab) may carry them
 *    either as multiple `instances` on each section-level cell (index i =
 *    section i), or as a nested grid-shaped structure under the row; both
 *    are handled (see `sectionsForRow`).
 *  - A second, unlabeled grid for dropped/withdrawn sections, identified by
 *    a "Dropped/Withdrawn Sections" column instead of a label.
 *  - Same subtotal-row and label-first column-lookup conventions as the
 *    academic-record parser (T-312).
 *
 * Never emit the student's name, ID, or an instructor's email - only the
 * instructor's (public) name. See SECURITY.md.
 */
import { GridSchema, RootSchema, type Cell, type Column, type Row } from "./schema.ts";
import {
  WorkdayShapeError,
  type CurrentCourse,
  type CurrentRegistrationsResult,
  type RegisteredSection,
  type Season,
  type Term,
  type UnrecognizedRow,
} from "./types.ts";
import { findGrids, isPlainObject } from "../workday-json/find-grids.ts";

type JsonObject = Record<string, unknown>;

type GridFamily = "enrolled" | "dropped";

function columnLabels(node: JsonObject): string[] {
  const columns = Array.isArray(node.columns) ? node.columns : [];
  return columns
    .filter(isPlainObject)
    .map((c) => (typeof c.label === "string" ? c.label : undefined))
    .filter((l): l is string => Boolean(l));
}

function classifyGrid(node: JsonObject): GridFamily | null {
  const labels = columnLabels(node);
  const hasLabel = (label: string): boolean => labels.includes(label);

  // A "Dropped/Withdrawn Sections" column is the unambiguous signal for the
  // dropped grid, regardless of whether the grid itself carries a label.
  if (hasLabel("Dropped/Withdrawn Sections")) return "dropped";

  if (typeof node.label === "string" && node.label === "My Enrolled Courses") return "enrolled";

  if (
    hasLabel("Course Listing") &&
    hasLabel("Registration Status") &&
    !hasLabel("Dropped/Withdrawn Sections")
  ) {
    return "enrolled";
  }

  return null;
}

function resolveColumnId(
  columns: Column[],
  rows: Row[],
  targetLabel: string | undefined,
  idSuffix: string,
): string | undefined {
  if (targetLabel) {
    for (const c of columns) {
      if (c.label === targetLabel) return String(c.columnId);
    }
    for (const c of columns) {
      const cid = String(c.columnId);
      for (const r of rows) {
        if (r.cellsMap[cid]?.label === targetLabel) return cid;
      }
    }
  }
  for (const c of columns) {
    if (String(c.columnId).endsWith(idSuffix)) return String(c.columnId);
  }
  return undefined;
}

/** Reads a cell's text at instance index `i`, falling back to a single shared instance/text/value. */
function cellTextAt(cell: Cell | undefined, i: number): string | null {
  if (!cell) return null;
  if (cell.instances && cell.instances.length > 0) {
    const inst = cell.instances[i] ?? (cell.instances.length === 1 ? cell.instances[0] : undefined);
    const text = inst?.text;
    return typeof text === "string" && text.trim() !== "" ? text.trim() : null;
  }
  if (typeof cell.text === "string" && cell.text.trim() !== "") return cell.text.trim();
  if (typeof cell.value === "string" && cell.value.trim() !== "") return cell.value.trim();
  return null;
}

function getInstanceText(cell: Cell | undefined): string | undefined {
  const text = cellTextAt(cell, 0);
  return text ?? undefined;
}

function getNumericValue(cell: Cell | undefined): number | null {
  if (!cell) return null;
  if (typeof cell.value === "number") return cell.value;
  if (typeof cell.value === "string") {
    const n = Number(cell.value);
    return Number.isFinite(n) ? n : null;
  }
  if (typeof cell.text === "string") {
    const n = Number(cell.text);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Meeting patterns for section index `i`: every instance's text when there's exactly one section, else just that index's. */
function meetingPatternsAt(cell: Cell | undefined, i: number, sectionCount: number): string[] {
  if (!cell) return [];
  if (cell.instances && cell.instances.length > 0) {
    if (sectionCount <= 1) {
      return cell.instances
        .map((inst) => (typeof inst.text === "string" ? inst.text.trim() : undefined))
        .filter((t): t is string => Boolean(t));
    }
    const text = cellTextAt(cell, i);
    return text ? [text] : [];
  }
  if (typeof cell.text === "string" && cell.text.trim() !== "") return [cell.text.trim()];
  return [];
}

function isSubtotalRow(
  row: Row,
  grid: { hasSubtotal?: boolean; subtotalRowCount?: number },
  primaryColId: string | undefined,
  numericColIds: (string | undefined)[],
): boolean {
  if (Array.isArray(row.subtotalColumnIds) && row.subtotalColumnIds.length > 0) {
    return true;
  }

  const hasSubtotalFlag =
    grid.hasSubtotal === true ||
    (typeof grid.subtotalRowCount === "number" && grid.subtotalRowCount > 0);
  if (!hasSubtotalFlag) return false;

  const primaryText = primaryColId ? getInstanceText(row.cellsMap[primaryColId]) : undefined;
  if (primaryText) return false;

  return numericColIds.some((id) => id !== undefined && getNumericValue(row.cellsMap[id]) !== null);
}

interface ParsedCourseText {
  subject: string;
  number: string;
  code: string;
  title: string;
}

const COURSE_TEXT_RE = /^(.+?)\s*-\s*(.+)$/;
const COURSE_CODE_RE = /^([A-Z&]{2,6})\s+([0-9]{3,4}[A-Z]?)$/;

function parseCourseText(text: string): ParsedCourseText | null {
  const outer = COURSE_TEXT_RE.exec(text.trim());
  if (!outer) return null;
  const codePart = outer[1]!.trim();
  const title = outer[2]!.trim();
  const codeMatch = COURSE_CODE_RE.exec(codePart);
  if (!codeMatch) return null;
  const subject = codeMatch[1]!;
  const number = codeMatch[2]!;
  return { subject, number, code: `${subject} ${number}`, title };
}

const DATE_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

/** Normalizes an `MM/DD/YYYY` date string to ISO `yyyy-mm-dd`; null if unparsable. */
function normalizeDate(raw: string | null): string | null {
  if (!raw) return null;
  const m = DATE_RE.exec(raw.trim());
  if (!m) return null;
  const month = m[1]!.padStart(2, "0");
  const day = m[2]!.padStart(2, "0");
  const year = m[3]!;
  return `${year}-${month}-${day}`;
}

/**
 * Derives a term from a section's ISO start date, per the mapping observed
 * for LSU's academic calendar: January starts Spring, May/June/July starts
 * Summer, August/September starts Fall, December starts Wintersession.
 * Other months (mid-semester starts) don't map to a term start and yield
 * null - this is a documented assumption for the human to confirm against
 * real data.
 */
function termFromStartDate(iso: string | null): Term | null {
  if (!iso) return null;
  const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(iso);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return null;

  if (month === 1) {
    const season: Season = "Spring";
    return { season, year, label: `Spring Semester ${year}` };
  }
  if (month === 5 || month === 6 || month === 7) {
    const season: Season = "Summer";
    return { season, year, label: `Summer Semester ${year}` };
  }
  if (month === 8 || month === 9) {
    const season: Season = "Fall";
    return { season, year, label: `Fall Semester ${year}` };
  }
  if (month === 12) {
    return { season: "Winter", year, label: `Wintersession ${year}` };
  }
  return null;
}

interface SectionColumnIds {
  sectionColId: string | undefined;
  instructionalFormatColId: string | undefined;
  deliveryModeColId: string | undefined;
  meetingPatternsColId: string | undefined;
  instructorColId: string | undefined;
  startDateColId: string | undefined;
  endDateColId: string | undefined;
}

function resolveSectionColumnIds(columns: Column[], rows: Row[]): SectionColumnIds {
  return {
    sectionColId: resolveColumnId(columns, rows, "Section", ".1"),
    instructionalFormatColId: resolveColumnId(columns, rows, "Instructional Format", ".6"),
    deliveryModeColId: resolveColumnId(columns, rows, "Delivery Mode", ".7"),
    meetingPatternsColId: resolveColumnId(columns, rows, "Meeting Patterns", ".8"),
    instructorColId: resolveColumnId(columns, rows, "Instructor", ".9"),
    startDateColId: resolveColumnId(columns, rows, "Start Date", ".10"),
    endDateColId: resolveColumnId(columns, rows, "End Date", ".11"),
  };
}

function buildSectionAt(
  row: Row,
  colIds: SectionColumnIds,
  i: number,
  sectionCount: number,
): RegisteredSection {
  const startDate = normalizeDate(cellTextAt(row.cellsMap[colIds.startDateColId ?? ""], i));
  const endDate = normalizeDate(cellTextAt(row.cellsMap[colIds.endDateColId ?? ""], i));
  return {
    section: cellTextAt(row.cellsMap[colIds.sectionColId ?? ""], i),
    instructionalFormat: cellTextAt(row.cellsMap[colIds.instructionalFormatColId ?? ""], i),
    deliveryMode: cellTextAt(row.cellsMap[colIds.deliveryModeColId ?? ""], i),
    meetingPatterns: meetingPatternsAt(
      row.cellsMap[colIds.meetingPatternsColId ?? ""],
      i,
      sectionCount,
    ),
    instructor: cellTextAt(row.cellsMap[colIds.instructorColId ?? ""], i),
    startDate,
    endDate,
  };
}

/** How many sections a row's flat (non-nested) section-level cells describe. */
function flatSectionCount(row: Row, colIds: SectionColumnIds): number {
  const relevantIds = [
    colIds.sectionColId,
    colIds.instructionalFormatColId,
    colIds.deliveryModeColId,
    colIds.instructorColId,
    colIds.startDateColId,
    colIds.endDateColId,
  ];
  let max = 0;
  for (const id of relevantIds) {
    if (id === undefined) continue;
    const cell = row.cellsMap[id];
    if (cell?.instances && cell.instances.length > max) {
      max = cell.instances.length;
    }
  }
  return Math.max(max, 1);
}

/**
 * Builds section entries for one course row, handling both plausible
 * shapes for a multi-section course (see the module doc comment):
 *  1. A nested grid-shaped structure buried somewhere under the row - if
 *     found, its own rows become the sections.
 *  2. Section-level cells directly in the row's own `cellsMap`, with one
 *     `instances` entry per section (index-aligned across columns).
 */
function sectionsForRow(
  row: Row,
  rowPath: string,
  flatColIds: SectionColumnIds,
): RegisteredSection[] {
  const nestedGrids = findGrids(row as unknown as JsonObject, rowPath);
  if (nestedGrids.length > 0) {
    const nestedSections: RegisteredSection[] = [];
    for (const candidate of nestedGrids) {
      const parsed = GridSchema.safeParse(candidate.node);
      if (!parsed.success) continue;
      const nestedColIds = resolveSectionColumnIds(parsed.data.columns, parsed.data.rows);
      for (const nestedRow of parsed.data.rows) {
        nestedSections.push(buildSectionAt(nestedRow, nestedColIds, 0, 1));
      }
    }
    if (nestedSections.length > 0) return nestedSections;
  }

  const count = flatSectionCount(row, flatColIds);
  const sections: RegisteredSection[] = [];
  for (let i = 0; i < count; i++) {
    sections.push(buildSectionAt(row, flatColIds, i, count));
  }
  return sections;
}

function parseGridWithZod(node: JsonObject, path: string) {
  const result = GridSchema.safeParse(node);
  if (!result.success) {
    const issue = result.error.issues[0];
    const issuePath = issue ? issue.path.join(".") : "";
    const fullPath = issuePath ? `${path}.${issuePath}` : path;
    throw new WorkdayShapeError(
      `Grid at ${path} has an unexpected shape: ${issue?.message ?? "invalid"}`,
      fullPath,
    );
  }
  return result.data;
}

function processGrid(
  grid: ReturnType<typeof parseGridWithZod>,
  gridLabel: string,
  gridPath: string,
  family: GridFamily,
  out: CurrentCourse[],
  unrecognizedRows: UnrecognizedRow[],
): void {
  const courseListingColId = resolveColumnId(grid.columns, grid.rows, "Course Listing", ".2");
  const creditHoursColId = resolveColumnId(grid.columns, grid.rows, "Credit Hours", ".10");
  const gradingBasisColId = resolveColumnId(grid.columns, grid.rows, "Grading Basis", ".11");
  const registrationStatusColId = resolveColumnId(
    grid.columns,
    grid.rows,
    "Registration Status",
    ".2",
  );
  const sectionColIds = resolveSectionColumnIds(grid.columns, grid.rows);

  if (!courseListingColId) {
    throw new WorkdayShapeError(
      `Grid "${gridLabel}" has no recognizable "Course Listing" column`,
      `${gridPath}.columns`,
    );
  }

  for (const row of grid.rows) {
    if (isSubtotalRow(row, grid, courseListingColId, [creditHoursColId])) {
      continue;
    }

    const courseText = getInstanceText(row.cellsMap[courseListingColId]);
    if (!courseText) {
      unrecognizedRows.push({ gridLabel, rowIndex: row.rowIndex, reason: "missing course text" });
      continue;
    }
    const parsedCourse = parseCourseText(courseText);
    if (!parsedCourse) {
      unrecognizedRows.push({
        gridLabel,
        rowIndex: row.rowIndex,
        reason: "unparsable course text",
      });
      continue;
    }

    const creditHours = creditHoursColId ? getNumericValue(row.cellsMap[creditHoursColId]) : null;
    const gradingBasis = gradingBasisColId
      ? (getInstanceText(row.cellsMap[gradingBasisColId]) ?? null)
      : null;
    const registrationStatus = registrationStatusColId
      ? (getInstanceText(row.cellsMap[registrationStatusColId]) ?? null)
      : null;

    const sections = sectionsForRow(row, `${gridPath}.rows[${row.rowIndex}]`, sectionColIds);
    let term: Term | null = null;
    for (const section of sections) {
      term = termFromStartDate(section.startDate);
      if (term) break;
    }

    out.push({
      code: parsedCourse.code,
      subject: parsedCourse.subject,
      number: parsedCourse.number,
      title: parsedCourse.title,
      creditHours,
      gradingBasis,
      registrationStatus,
      term,
      sections,
    });
  }
}

export function parseCurrentRegistrations(json: unknown): CurrentRegistrationsResult {
  const rootResult = RootSchema.safeParse(json);
  if (!rootResult.success) {
    throw new WorkdayShapeError('Response is missing a "body" object', "body");
  }
  const body = rootResult.data.body;

  const candidates = findGrids(body, "body");
  if (candidates.length === 0) {
    throw new WorkdayShapeError('No "grid" widgets found under body', "body");
  }

  const enrolled: CurrentCourse[] = [];
  const dropped: CurrentCourse[] = [];
  const unrecognizedRows: UnrecognizedRow[] = [];
  let recognizedGridCount = 0;

  for (const candidate of candidates) {
    const family = classifyGrid(candidate.node);
    if (!family) continue;
    recognizedGridCount++;

    const grid = parseGridWithZod(candidate.node, candidate.path);
    const gridLabel =
      grid.label ?? (family === "enrolled" ? "My Enrolled Courses" : "Dropped/Withdrawn Sections");

    processGrid(
      grid,
      gridLabel,
      candidate.path,
      family,
      family === "enrolled" ? enrolled : dropped,
      unrecognizedRows,
    );
  }

  if (recognizedGridCount === 0) {
    throw new WorkdayShapeError(
      'No "My Enrolled Courses" or dropped/withdrawn-sections grid recognized under body',
      "body",
    );
  }

  return { enrolled, dropped, unrecognizedRows };
}
