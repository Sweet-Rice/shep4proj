import {
  CourseCodeSchema,
  toCatalogCode,
  type CourseCode,
  type PlanTerm,
  type Season,
} from "@jevschedule/shared";
import type { TranscriptParseResult } from "@jevschedule/workday";
import type { AcademicRecordResult } from "@jevschedule/workday/academic-record";
import type { AcademicProgressResult } from "@jevschedule/workday/academic-progress";
import type { CurrentRegistrationsResult } from "@jevschedule/workday/current-registrations";

// Honors sections append "(HNR)" to the letter grade, e.g. "A+ (HNR)".
const COMPLETED_GRADE = /^(?:[ABCD][+-]?|P|Pass)(?:\s*\(HNR\))?$/i;

/** Whether `grade` earns credit, so the course can enter the completed store. */
export function isCompletedGrade(grade: string): boolean {
  return COMPLETED_GRADE.test(grade.trim());
}

/** A parsed course left out of the store. Carries its code and sanitized grade reason, never other row text. */
export interface SkippedCourse {
  code: string;
  reason: string;
}

/**
 * Parsed import data in the local store's formats (T-322).
 *
 * - `completed`: codes to pass to `CompletedStore.setCompleted(code, true)`. An import only
 *   adds courses; it never unmarks one the student entered by hand.
 * - `inProgress`: courses the student is taking now, one {@link PlanTerm} per term. A term's
 *   `courses` is the `plannedSameTerm` set for `isEligible`, and `validatePlan` treats them
 *   as prior for later terms. A retake can appear here and in `completed`, since both hold.
 *   Whoever persists these into the plan store must dedupe against courses already planned:
 *   `plan_courses.code` is unique across the whole plan.
 *
 * For the import pipeline (#153):
 * - The academic record and current registrations can both return the current term, and
 *   `PlanSchema` rejects a repeated term or course, so merge their `inProgress` terms before
 *   saving.
 * - A record row with a null grade in a past term also lands in `inProgress`. There it means the
 *   grade hasn't been posted yet, not that the student is still taking the course.
 */
export interface StoreImport {
  completed: CourseCode[];
  inProgress: PlanTerm[];
  skipped: SkippedCourse[];
  academicProgress?: AcademicProgressResult | null;
}

type Outcome = "completed" | "in-progress" | { skip: string };

interface ImportRow {
  code: string;
  term: { season: Season; year: number } | null;
  outcome: Outcome;
}

/** The local review reason for a grade outside the supported credit and in-progress values. */
export function noCreditGradeReason(grade: string): string {
  const displayGrade = grade.trim().replace(/\p{C}/gu, "").slice(0, 12);
  return `grade "${displayGrade}" does not earn credit`;
}

/** Whether the source marks a course as currently in progress or has not posted a grade. */
export function isInProgressGrade(grade: string | null): boolean {
  const normalized = grade?.trim() ?? "";
  return normalized === "" || /^(?:IP|In Progress|--)$/i.test(normalized);
}

/** Null, blank, and common in-progress grades mean the course is still under way. */
function gradeOutcome(grade: string | null): Outcome {
  const normalized = grade?.trim() ?? "";
  if (isInProgressGrade(normalized)) return "in-progress";
  return isCompletedGrade(normalized) ? "completed" : { skip: noCreditGradeReason(normalized) };
}

function toStoreImport(rows: ImportRow[]): StoreImport {
  const completed = new Set<CourseCode>();
  const terms = new Map<string, PlanTerm>();
  const skipped: SkippedCourse[] = [];
  for (const { code: rawCode, term, outcome } of rows) {
    const parsedCode = CourseCodeSchema.safeParse(rawCode);
    if (!parsedCode.success) {
      skipped.push({ code: rawCode, reason: "unrecognized course code format" });
      continue;
    }
    const code = toCatalogCode(parsedCode.data);
    if (typeof outcome === "object") {
      skipped.push({ code, reason: outcome.skip });
      continue;
    }
    if (outcome === "completed") {
      completed.add(code);
      continue;
    }
    if (term === null) {
      skipped.push({ code, reason: "in-progress term unknown" });
      continue;
    }
    const key = `${term.season} ${term.year}`;
    const planTerm = terms.get(key) ?? { season: term.season, year: term.year, courses: [] };
    if (!planTerm.courses.includes(code)) planTerm.courses.push(code);
    terms.set(key, planTerm);
  }
  return { completed: [...completed].sort(), inProgress: [...terms.values()], skipped };
}

/**
 * Maps the Workday academic record. Courses are classified by grade, not the parser's
 * `status`, which counts any grade other than F or Withdrawal (Audit included) as completed.
 * Transfer credit follows the same grade rule.
 */
export function mapAcademicRecord(record: AcademicRecordResult): StoreImport {
  return toStoreImport([
    ...record.courses.map(({ code, term, grade }) => ({
      code,
      term,
      outcome: gradeOutcome(grade),
    })),
    ...record.transferCredits.map(({ code, grade }) => ({
      code,
      term: null,
      outcome: gradeOutcome(grade),
    })),
  ]);
}

/** Maps a parsed transcript PDF; "IP" rows are kept as in-progress. */
export function mapTranscript(transcript: TranscriptParseResult): StoreImport {
  return toStoreImport(
    transcript.courses.map(({ code, term, grade }) => ({
      code,
      term,
      outcome: gradeOutcome(grade),
    })),
  );
}

/**
 * Maps current-term registrations to in-progress courses. Only an enrolled course whose status
 * is "Registered" or missing counts; any other status (e.g. "Waitlisted") is skipped. Dropped
 * and withdrawn sections are ignored.
 */
export function mapCurrentRegistrations(registrations: CurrentRegistrationsResult): StoreImport {
  return toStoreImport(
    registrations.enrolled.map(({ code, term, registrationStatus }) => ({
      code,
      term,
      outcome:
        registrationStatus === null || registrationStatus === "Registered"
          ? "in-progress"
          : { skip: "registration not confirmed" },
    })),
  );
}
