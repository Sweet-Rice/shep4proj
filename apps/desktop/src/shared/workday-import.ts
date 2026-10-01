import { CourseCodeSchema, type CourseCode, type PlanTerm, type Season } from "@jevschedule/shared";
import type { TranscriptParseResult } from "@jevschedule/workday";
import type { AcademicRecordResult } from "@jevschedule/workday/academic-record";
import type { CurrentRegistrationsResult } from "@jevschedule/workday/current-registrations";

const COMPLETED_GRADE = /^(?:[ABCD][+-]?|P|Pass)$/i;

/** Whether `grade` earns credit, so the course can enter the completed store. */
export function isCompletedGrade(grade: string): boolean {
  return COMPLETED_GRADE.test(grade);
}

/** A parsed course left out of the store. Carries only the course code, never row text. */
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
 */
export interface StoreImport {
  completed: CourseCode[];
  inProgress: PlanTerm[];
  skipped: SkippedCourse[];
}

type Outcome = "completed" | "in-progress" | { skip: string };

interface ImportRow {
  code: string;
  term: { season: Season; year: number } | null;
  outcome: Outcome;
}

const NO_CREDIT = { skip: "grade does not earn credit" };

/** A null grade (academic record) or "IP" (transcript) means the course is still under way. */
function gradeOutcome(grade: string | null): Outcome {
  if (grade === null || grade === "IP") return "in-progress";
  return isCompletedGrade(grade) ? "completed" : NO_CREDIT;
}

function toStoreImport(rows: ImportRow[]): StoreImport {
  const completed = new Set<CourseCode>();
  const terms = new Map<string, PlanTerm>();
  const skipped: SkippedCourse[] = [];
  for (const { code: rawCode, term, outcome } of rows) {
    if (typeof outcome === "object") {
      skipped.push({ code: rawCode, reason: outcome.skip });
      continue;
    }
    const code = CourseCodeSchema.safeParse(rawCode);
    if (!code.success) {
      skipped.push({ code: rawCode, reason: "catalog course code not supported" });
      continue;
    }
    if (outcome === "completed") {
      completed.add(code.data);
      continue;
    }
    if (term === null) {
      skipped.push({ code: code.data, reason: "in-progress term unknown" });
      continue;
    }
    const key = `${term.season} ${term.year}`;
    const planTerm = terms.get(key) ?? { season: term.season, year: term.year, courses: [] };
    if (!planTerm.courses.includes(code.data)) planTerm.courses.push(code.data);
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
      outcome: grade !== null && isCompletedGrade(grade) ? ("completed" as const) : NO_CREDIT,
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
 * Maps current-term registrations to in-progress courses. Dropped and withdrawn sections are
 * ignored; an enrolled course counts unless its status says otherwise (e.g. "Waitlisted").
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
