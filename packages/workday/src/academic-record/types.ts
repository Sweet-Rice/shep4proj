/**
 * Public types for the "View My Academic Record" Workday response parser.
 *
 * These describe only what we choose to expose. The parser never emits the
 * student's name, ID, or the raw row-descriptor text that Workday embeds
 * those in (see SECURITY.md).
 */

export type Season = "Fall" | "Spring" | "Summer" | "Winter";

export interface Term {
  season: Season;
  year: number;
  /** Display label, e.g. "Spring Semester 2025" or "Wintersession 2025". */
  label: string;
}

export type CourseStatus = "completed" | "in-progress" | "withdrawn" | "failed";

export interface CompletedCourse {
  /** e.g. "CSC 1351" */
  code: string;
  subject: string;
  /** e.g. "1351" or "4999G" (may carry a trailing suffix letter). */
  number: string;
  title: string;
  term: Term | null;
  grade: string | null;
  gradePoints: number | null;
  creditHours: number | null;
  status: CourseStatus;
}

export interface TransferCredit {
  code: string;
  subject: string;
  number: string;
  title: string;
  creditHours: number | null;
  grade: string | null;
  source: string | null;
}

export interface UnrecognizedRow {
  gridLabel: string;
  rowIndex: number;
  reason: string;
}

export interface AcademicRecordResult {
  courses: CompletedCourse[];
  transferCredits: TransferCredit[];
  unrecognizedRows: UnrecognizedRow[];
}

/**
 * Thrown when the Workday response doesn't have the shape the parser
 * relies on (missing body, no grids, grids missing rows/columns, or cell
 * types that don't match what we expect). The UI uses `path` to decide
 * whether to fall back to the transcript-upload flow (US-09).
 */
export class WorkdayShapeError extends Error {
  readonly path: string;

  constructor(message: string, path: string) {
    super(message);
    this.name = "WorkdayShapeError";
    this.path = path;
  }
}
