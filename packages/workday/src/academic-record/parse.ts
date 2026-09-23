/**
 * Parser for the Workday "View My Academic Record" JSON response.
 *
 * The response is a large, deeply-nested UI descriptor. The data we want
 * (completed coursework and transfer credit) lives in `widget: "grid"`
 * objects buried at varying depth under `body`, wrapped in `panelList` /
 * `panel` objects. We search for grids recursively rather than assuming a
 * fixed depth, and identify columns by label first (falling back to the
 * numeric id suffix), since Workday renumbers column ids across releases.
 *
 * Never emit the row-descriptor text, student name, or student ID — see
 * SECURITY.md.
 */
import { GridSchema, RootSchema, type Cell, type Column, type Row } from "./schema.ts";
import {
  WorkdayShapeError,
  type AcademicRecordResult,
  type CompletedCourse,
  type CourseStatus,
  type Season,
  type Term,
  type TransferCredit,
  type UnrecognizedRow,
} from "./types.ts";
import {
  findGrids,
  isPlainObject,
  type GridCandidate,
  type PanelContext,
} from "../workday-json/find-grids.ts";

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return isPlainObject(value);
}

type GridFamily = "coursework" | "transfer";

function classifyGrid(node: JsonObject): GridFamily | null {
  const columns = Array.isArray(node.columns) ? node.columns : [];
  const labels = columns
    .filter(isObject)
    .map((c) => (typeof c.label === "string" ? c.label : undefined))
    .filter((l): l is string => Boolean(l));
  const ids = columns
    .filter(isObject)
    .map((c) => (c.columnId === undefined ? "" : String(c.columnId)));

  const hasLabel = (label: string): boolean => labels.includes(label);
  const idPrefixMatches = (prefix: string): boolean => ids.some((id) => id.startsWith(prefix));

  if (hasLabel("Transfer Credit") || hasLabel("Originating Exam") || idPrefixMatches("601.")) {
    return "transfer";
  }
  if (hasLabel("Course") || hasLabel("Grade Points") || idPrefixMatches("90.")) {
    return "coursework";
  }
  if (typeof node.label === "string") {
    if (node.label === "Enrollments") return "coursework";
    if (node.label.toLowerCase().includes("transfer")) return "transfer";
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

function getInstanceText(cell: Cell | undefined): string | undefined {
  if (!cell) return undefined;
  if (cell.instances && cell.instances.length > 0) {
    const text = cell.instances[0]?.text;
    return typeof text === "string" ? text : undefined;
  }
  return typeof cell.text === "string" ? cell.text : undefined;
}

function getNumericValue(cell: Cell | undefined): number | null {
  if (!cell) return null;
  return typeof cell.value === "number" ? cell.value : null;
}

/**
 * Workday appends a grid-total row to grids that have `hasSubtotal`/
 * `subtotalRowCount` set (e.g. a "Total Credit Hours" row at the end of an
 * Enrollments grid). It has no Course/Grade text, only numeric totals, and
 * is not a course the student took — it must be skipped silently, not
 * reported as an unrecognized row.
 */
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

const SEASON_TERM_RE = /(Fall|Spring|Summer)\s+Semester\s+(\d{4})/;
const WINTER_TERM_RE = /Wintersession\s+(\d{4})/;

function parseTermFromText(text: string | undefined): Term | null {
  if (!text) return null;
  const seasonMatch = SEASON_TERM_RE.exec(text);
  if (seasonMatch) {
    const season = seasonMatch[1] as Season;
    const year = Number(seasonMatch[2]);
    return { season, year, label: `${season} Semester ${year}` };
  }
  const winterMatch = WINTER_TERM_RE.exec(text);
  if (winterMatch) {
    const year = Number(winterMatch[1]);
    return { season: "Winter", year, label: `Wintersession ${year}` };
  }
  return null;
}

function termFromPanelStack(panelStack: PanelContext[]): Term | null {
  for (let i = panelStack.length - 1; i >= 0; i--) {
    const ctx = panelStack[i]!;
    const fromTitle = parseTermFromText(ctx.title);
    if (fromTitle) return fromTitle;
    const fromLabel = parseTermFromText(ctx.label);
    if (fromLabel) return fromLabel;
  }
  return null;
}

function computeStatus(grade: string | null): CourseStatus {
  if (grade === null) return "in-progress";
  if (grade === "Withdrawal") return "withdrawn";
  if (grade === "F") return "failed";
  return "completed";
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

function processCourseworkGrid(
  grid: ReturnType<typeof parseGridWithZod>,
  gridLabel: string,
  gridPath: string,
  panelStack: PanelContext[],
  courses: CompletedCourse[],
  unrecognizedRows: UnrecognizedRow[],
): void {
  const descriptorColId = resolveColumnId(grid.columns, grid.rows, undefined, ".1");
  const courseColId = resolveColumnId(grid.columns, grid.rows, "Course", ".2");
  const gradeColId = resolveColumnId(grid.columns, grid.rows, "Grade", ".5");
  const gradePointsColId = resolveColumnId(grid.columns, grid.rows, "Grade Points", ".6");
  const creditHoursColId = resolveColumnId(grid.columns, grid.rows, "Credit Hours", ".7");

  if (!courseColId) {
    throw new WorkdayShapeError(
      `Coursework grid "${gridLabel}" has no recognizable "Course" column`,
      `${gridPath}.columns`,
    );
  }

  const termFromPanel = termFromPanelStack(panelStack);

  for (const row of grid.rows) {
    if (isSubtotalRow(row, grid, courseColId, [gradePointsColId, creditHoursColId])) {
      continue;
    }

    const courseCell = row.cellsMap[courseColId];
    const courseText = getInstanceText(courseCell);
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

    const descriptorText = descriptorColId
      ? getInstanceText(row.cellsMap[descriptorColId])
      : undefined;
    const term = parseTermFromText(descriptorText) ?? termFromPanel;

    const gradeText = gradeColId ? getInstanceText(row.cellsMap[gradeColId]) : undefined;
    const grade = gradeText && gradeText.trim() !== "" ? gradeText.trim() : null;

    const gradePoints = gradePointsColId ? getNumericValue(row.cellsMap[gradePointsColId]) : null;
    const creditHours = creditHoursColId ? getNumericValue(row.cellsMap[creditHoursColId]) : null;

    courses.push({
      code: parsedCourse.code,
      subject: parsedCourse.subject,
      number: parsedCourse.number,
      title: parsedCourse.title,
      term,
      grade,
      gradePoints,
      creditHours,
      status: computeStatus(grade),
    });
  }
}

function processTransferGrid(
  grid: ReturnType<typeof parseGridWithZod>,
  gridLabel: string,
  gridPath: string,
  transferCredits: TransferCredit[],
  unrecognizedRows: UnrecognizedRow[],
): void {
  const transferColId = resolveColumnId(grid.columns, grid.rows, "Transfer Credit", ".2");
  const creditHoursColId = resolveColumnId(grid.columns, grid.rows, "Credit Hours", ".4");
  const gradeColId = resolveColumnId(grid.columns, grid.rows, "Grade", ".5");
  const sourceColId = resolveColumnId(grid.columns, grid.rows, "Originating Exam", ".6");

  if (!transferColId) {
    throw new WorkdayShapeError(
      `Transfer credit grid "${gridLabel}" has no recognizable "Transfer Credit" column`,
      `${gridPath}.columns`,
    );
  }

  for (const row of grid.rows) {
    if (isSubtotalRow(row, grid, transferColId, [creditHoursColId])) {
      continue;
    }

    const transferCell = row.cellsMap[transferColId];
    const transferText = getInstanceText(transferCell);
    if (!transferText) {
      unrecognizedRows.push({
        gridLabel,
        rowIndex: row.rowIndex,
        reason: "missing transfer credit text",
      });
      continue;
    }
    const parsed = parseCourseText(transferText);
    if (!parsed) {
      unrecognizedRows.push({
        gridLabel,
        rowIndex: row.rowIndex,
        reason: "unparsable transfer credit text",
      });
      continue;
    }

    const creditHours = creditHoursColId ? getNumericValue(row.cellsMap[creditHoursColId]) : null;
    const gradeText = gradeColId ? getInstanceText(row.cellsMap[gradeColId]) : undefined;
    const grade = gradeText && gradeText.trim() !== "" ? gradeText.trim() : null;
    const sourceText = sourceColId ? getInstanceText(row.cellsMap[sourceColId]) : undefined;
    const source = sourceText && sourceText.trim() !== "" ? sourceText.trim() : null;

    transferCredits.push({
      code: parsed.code,
      subject: parsed.subject,
      number: parsed.number,
      title: parsed.title,
      creditHours,
      grade,
      source,
    });
  }
}

export function parseAcademicRecord(json: unknown): AcademicRecordResult {
  const rootResult = RootSchema.safeParse(json);
  if (!rootResult.success) {
    throw new WorkdayShapeError('Response is missing a "body" object', "body");
  }
  const body = rootResult.data.body;

  const candidates: GridCandidate[] = findGrids(body, "body");
  if (candidates.length === 0) {
    throw new WorkdayShapeError('No "grid" widgets found under body', "body");
  }

  const courses: CompletedCourse[] = [];
  const transferCredits: TransferCredit[] = [];
  const unrecognizedRows: UnrecognizedRow[] = [];
  let recognizedGridCount = 0;

  for (const candidate of candidates) {
    const family = classifyGrid(candidate.node);
    if (!family) continue;
    recognizedGridCount++;

    const grid = parseGridWithZod(candidate.node, candidate.path);
    const gridLabel =
      grid.label ?? (family === "coursework" ? "Enrollments" : "Transfer Credit from Exams");

    if (family === "coursework") {
      processCourseworkGrid(
        grid,
        gridLabel,
        candidate.path,
        candidate.panelStack,
        courses,
        unrecognizedRows,
      );
    } else {
      processTransferGrid(grid, gridLabel, candidate.path, transferCredits, unrecognizedRows);
    }
  }

  if (recognizedGridCount === 0) {
    throw new WorkdayShapeError(
      'No "Enrollments" or "Transfer Credit" grids recognized under body',
      "body",
    );
  }

  return { courses, transferCredits, unrecognizedRows };
}
