import { parseAcademicProgress } from "@jevschedule/workday/academic-progress";
import type { AcademicProgressResult } from "@jevschedule/workday/academic-progress";
import type { Session } from "electron";
import { WorkdayShapeError, parseAcademicRecord } from "@jevschedule/workday/academic-record";
import { parseCurrentRegistrations } from "@jevschedule/workday/current-registrations";
import type { PlanTerm, CourseCode } from "@jevschedule/shared";
import type { StoreImport } from "../shared/workday-import.js";
import { mapAcademicRecord, mapCurrentRegistrations } from "../shared/workday-import.js";
import type { WorkdayImportProgress, WorkdayImportReview } from "../shared/ipc.js";
import type { Logger } from "./log/logger.js";
import type { WorkdaySessionCredentials, WorkdaySignInResult } from "./workday-signin.js";

const HOME_URL = "https://www.myworkday.com/lsu/d/home.htmld";
const ACADEMIC_RECORD_URL = "https://www.myworkday.com/lsu/generic-hub/task/2998$30300.htmld";
const ACADEMIC_PROGRESS_URL = "https://www.myworkday.com/lsu/generic-hub/task/2998$43459.htmld";
const REGISTRATIONS_URL = "https://www.myworkday.com/lsu/generic-hub/task/2998$28771.htmld";

export class WorkdayAuthenticationError extends Error {
  constructor() {
    super("Workday authentication expired");
    this.name = "WorkdayAuthenticationError";
  }
}

export interface WorkdayImporterDependencies {
  signIn: () => Promise<WorkdaySignInResult>;
  clearSession: () => Promise<void>;
  fetchJson: (
    session: Session,
    url: string,
    headers?: Readonly<Record<string, string>>,
  ) => Promise<unknown>;
  log: Logger;
}

export interface WorkdayImporter {
  run(emit: (progress: WorkdayImportProgress) => void): Promise<WorkdayImportReview>;
}

function reviewFromMaps(academic: StoreImport, registrations: StoreImport): WorkdayImportReview {
  const terms = new Map<string, PlanTerm>();
  for (const term of [...academic.inProgress, ...registrations.inProgress]) {
    const key = `${term.season} ${term.year}`;
    const existing = terms.get(key);
    if (!existing) {
      terms.set(key, { ...term, courses: [...new Set(term.courses)] });
      continue;
    }
    for (const code of term.courses) {
      if (!existing.courses.includes(code)) existing.courses.push(code);
    }
  }
  const completed = [
    ...new Set<CourseCode>([...academic.completed, ...registrations.completed]),
  ].sort();
  const skipped = [...academic.skipped, ...registrations.skipped];
  return { completed, inProgress: [...terms.values()], skipped };
}

function readSessionHeaders(
  credentials: WorkdaySessionCredentials,
): Readonly<Record<string, string>> {
  const { sessionSecureToken, uiClientVersion } = credentials;
  if (sessionSecureToken.trim().length === 0 || uiClientVersion.trim().length === 0) {
    throw new Error("Workday session headers are unavailable");
  }
  return {
    "session-secure-token": sessionSecureToken,
    "x-workday-client": uiClientVersion,
    accept: "application/json",
    referer: HOME_URL,
  };
}
/** Fetches a Workday review without navigating to or rendering any authenticated pages. */
export function createWorkdayImporter(deps: WorkdayImporterDependencies): WorkdayImporter {
  return {
    async run(emit) {
      let stage = "signing-in";
      let reviewResult: WorkdayImportReview | undefined;
      try {
        let authenticationAttempt = 0;
        while (true) {
          emit({ stage: "signing-in" });
          deps.log.info("workday import", stage);
          const signIn = await deps.signIn();
          if (signIn.status !== "success") throw new Error("Workday sign-in was not completed");

          stage = "fetching";
          emit({ stage: "fetching" });
          deps.log.info("workday import", stage);
          try {
            const headers = readSessionHeaders(signIn);
            const academic = mapAcademicRecord(
              parseAcademicRecord(
                await deps.fetchJson(signIn.session, ACADEMIC_RECORD_URL, headers),
              ),
            );
            const registrations = mapCurrentRegistrations(
              parseCurrentRegistrations(
                await deps.fetchJson(signIn.session, REGISTRATIONS_URL, headers),
              ),
            );
            let academicProgress: AcademicProgressResult | null = null;
            try {
              academicProgress = parseAcademicProgress(
                await deps.fetchJson(signIn.session, ACADEMIC_PROGRESS_URL, headers),
              );
            } catch (error) {
              if (error instanceof WorkdayAuthenticationError) throw error;
              deps.log.warn("workday import", "academic-progress-unavailable");
            }
            reviewResult = { ...reviewFromMaps(academic, registrations), academicProgress };
            stage = "review";
            emit({ stage: "review" });
            deps.log.info("workday import", stage, {
              completed: reviewResult.completed.length,
              inProgress: reviewResult.inProgress.reduce(
                (count, term) => count + term.courses.length,
                0,
              ),
              skipped: reviewResult.skipped.length,
            });
            break;
          } catch (error) {
            if (!(error instanceof WorkdayAuthenticationError) || authenticationAttempt > 0) {
              throw error;
            }
            authenticationAttempt += 1;
            await deps.clearSession();
            stage = "signing-in";
          }
        }
      } catch (error) {
        if (error instanceof WorkdayShapeError) {
          emit({
            stage: "error",
            fallback: "upload",
            message: "Workday's pages changed. Import your transcript PDF instead.",
          });
        } else {
          emit({ stage: "error", message: "Could not import records from Workday." });
        }
        deps.log.warn("workday import", "error", { previousStage: stage });
        throw error;
      }
      if (!reviewResult) throw new Error("Workday import did not produce a review");
      return reviewResult;
    },
  };
}
