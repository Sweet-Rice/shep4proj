import type { Session } from "electron";
import { WorkdayShapeError, parseAcademicRecord } from "@jevschedule/workday/academic-record";
import { parseCurrentRegistrations } from "@jevschedule/workday/current-registrations";
import type { PlanTerm, CourseCode } from "@jevschedule/shared";
import type { StoreImport } from "../shared/workday-import.js";
import { mapAcademicRecord, mapCurrentRegistrations } from "../shared/workday-import.js";
import type { WorkdayImportProgress, WorkdayImportReview } from "../shared/ipc.js";
import type { Logger } from "./log/logger.js";
import type { WorkdaySignInResult } from "./workday-signin.js";

const APP_ROOT_URL = "https://www.myworkday.com/lsu/app-root";
const HOME_URL = "https://www.myworkday.com/lsu/d/home.htmld";
const ACADEMIC_RECORD_URL = "https://www.myworkday.com/lsu/generic-hub/task/2998$30300.htmld";
const REGISTRATIONS_URL = "https://www.myworkday.com/lsu/generic-hub/task/2998$28771.htmld";

export interface WorkdayImporterDependencies {
  signIn: () => Promise<WorkdaySignInResult>;
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

function readSessionHeaders(json: unknown): Readonly<Record<string, string>> {
  if (
    typeof json !== "object" ||
    json === null ||
    !("sessionSecureToken" in json) ||
    !("uiClientVersion" in json)
  ) {
    throw new Error("Workday session headers are unavailable");
  }
  const { sessionSecureToken, uiClientVersion } = json;
  if (
    typeof sessionSecureToken !== "string" ||
    sessionSecureToken.length === 0 ||
    typeof uiClientVersion !== "string" ||
    uiClientVersion.length === 0
  ) {
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
      let ses: Session | undefined;
      let stage = "signing-in";
      let reviewResult: WorkdayImportReview | undefined;
      let failure: unknown;
      let failed = false;
      let cleanupFailed = false;
      emit({ stage: "signing-in" });
      deps.log.info("workday import", stage);
      try {
        const signIn = await deps.signIn();
        if (signIn.status !== "success") throw new Error("Workday sign-in was not completed");
        ses = signIn.session;
        stage = "fetching";
        emit({ stage: "fetching" });
        deps.log.info("workday import", stage);

        const headers = readSessionHeaders(await deps.fetchJson(ses, APP_ROOT_URL));
        const academic = mapAcademicRecord(
          parseAcademicRecord(await deps.fetchJson(ses, ACADEMIC_RECORD_URL, headers)),
        );
        const registrations = mapCurrentRegistrations(
          parseCurrentRegistrations(await deps.fetchJson(ses, REGISTRATIONS_URL, headers)),
        );
        reviewResult = reviewFromMaps(academic, registrations);
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
      } catch (error) {
        failed = true;
        failure = error;
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
      } finally {
        const activeSession = ses;
        if (activeSession) {
          try {
            const cleanup = await Promise.allSettled([
              Promise.resolve().then(() => activeSession.clearStorageData()),
              Promise.resolve().then(() => activeSession.clearCache()),
            ]);
            cleanupFailed = cleanup.some((result) => result.status === "rejected");
          } catch {
            cleanupFailed = true;
          }
          if (cleanupFailed) {
            deps.log.warn("workday import", "error", { previousStage: "teardown" });
          }
        }
      }
      if (cleanupFailed && !failed) {
        failed = true;
        failure = new Error("Workday session cleanup failed");
        emit({ stage: "error", message: "Could not import records from Workday." });
      }
      if (failed) throw failure;
      if (!reviewResult) throw new Error("Workday import did not produce a review");
      return reviewResult;
    },
  };
}
