import type {
  AcademicPeriodId,
  Course,
  CourseCode,
  CourseDetail,
  CourseOfferingHistory,
  DegreeProgram,
  DegreeSummary,
  Plan,
  PlanTerm,
  Section,
} from "@jevschedule/shared";
import type { TranscriptParseResult } from "@jevschedule/workday";
import type { SkippedCourse } from "./workday-import.js";

/**
 * IPC channel names shared by the main process and the preload script. Keeping them in one
 * place means a renamed channel breaks the build instead of silently never answering.
 */
export const IPC_CHANNELS = {
  completedGet: "completed:get",
  completedSet: "completed:set",
  planGet: "plan:get",
  planSave: "plan:save",
  transcriptSelect: "transcript:select",
  catalogCourses: "catalog:courses",
  catalogCourseDetails: "catalog:course-details",
  catalogCourseHistory: "catalog:course-history",
  catalogSections: "catalog:sections",
  catalogDegrees: "catalog:degrees",
  catalogDegree: "catalog:degree",
} as const;

/** Stages the main process reports while a Workday import runs (T-321). */
export type WorkdayImportStage = "signing-in" | "fetching" | "review" | "done" | "error";

export interface WorkdayImportProgress {
  stage: WorkdayImportStage;
  message?: string;
  fallback?: "upload";
}

export interface WorkdayImportReview {
  completed: CourseCode[];
  inProgress: PlanTerm[];
  skipped: SkippedCourse[];
}

/**
 * The API the preload exposes to the renderer as `window.jevschedule`. The renderer has no
 * Node or filesystem access (sandboxed, T-022), so everything local goes through here.
 */
export interface JevscheduleApi {
  completed: {
    get(): Promise<CourseCode[]>;
    set(code: CourseCode, completed: boolean): Promise<void>;
  };
  plan: {
    get(): Promise<Plan>;
    save(plan: Plan): Promise<void>;
  };
  transcript: {
    /** Opens the native PDF picker; null means the user cancelled. */
    select(): Promise<TranscriptParseResult | null>;
  };
  catalog: {
    listCourses(): Promise<Course[]>;
    getCourseDetails(codes: CourseCode[]): Promise<Record<CourseCode, CourseDetail>>;
    getCourseHistory(code: CourseCode): Promise<CourseOfferingHistory[]>;
    listSections(courseCode: CourseCode, term: AcademicPeriodId): Promise<Section[]>;
    listDegrees(): Promise<DegreeSummary[]>;
    getDegree(id: string): Promise<DegreeProgram>;
  };
}
