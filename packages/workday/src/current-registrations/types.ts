/**
 * Public types for the "View My Courses" (current-term registrations)
 * Workday response parser.
 *
 * These describe only what we choose to expose. Like the academic-record
 * parser, this never emits the student's name, ID, or any row-descriptor
 * text that might carry those (see SECURITY.md) - and additionally never
 * emits an instructor's email, only their (public) name.
 */

export type Season = "Fall" | "Spring" | "Summer" | "Winter";

export interface Term {
  season: Season;
  year: number;
  /** Display label, e.g. "Spring Semester 2025" or "Wintersession 2025". */
  label: string;
}

export interface RegisteredSection {
  /** e.g. "CSC 4330-1 - Software Systems Development" or "CSC 4330-001". */
  section: string | null;
  instructionalFormat: string | null;
  deliveryMode: string | null;
  /** e.g. ["MWF | 10:30 AM - 11:20 AM | Patrick F Taylor 1200"]. */
  meetingPatterns: string[];
  instructor: string | null;
  /** ISO yyyy-mm-dd, or null if missing/unparsable. */
  startDate: string | null;
  /** ISO yyyy-mm-dd, or null if missing/unparsable. */
  endDate: string | null;
}

export interface CurrentCourse {
  /** e.g. "CSC 4330" */
  code: string;
  subject: string;
  /** e.g. "4330" or "4999G" (may carry a trailing suffix letter). */
  number: string;
  title: string;
  creditHours: number | null;
  gradingBasis: string | null;
  /** e.g. "Registered" or "Waitlisted". */
  registrationStatus: string | null;
  /** Derived from the first section's start date; null if none parses. */
  term: Term | null;
  sections: RegisteredSection[];
}

export interface UnrecognizedRow {
  gridLabel: string;
  rowIndex: number;
  reason: string;
}

export interface CurrentRegistrationsResult {
  enrolled: CurrentCourse[];
  dropped: CurrentCourse[];
  unrecognizedRows: UnrecognizedRow[];
}

// Reused from the academic-record parser (same failure mode: the Workday
// response doesn't have the shape the parser relies on).
export { WorkdayShapeError } from "../academic-record/types.ts";
