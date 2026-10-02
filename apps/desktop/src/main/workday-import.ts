import {
  ALLOWED_ENDPOINTS,
  guardedFetch,
  type AllowedEndpoint,
  type PageLike as GuardedPage,
} from "@jevschedule/workday/allowlist";
import {
  launchWorkdayBrowser,
  teardownWorkdayBrowser,
  waitForWorkdayLogin,
  WORKDAY_TENANT_URL,
  type PageLike,
  type WorkdayBrowserSession,
} from "@jevschedule/workday/browser";
import { WorkdayShapeError, parseAcademicRecord } from "@jevschedule/workday/academic-record";
import { parseCurrentRegistrations } from "@jevschedule/workday/current-registrations";
import type { PlanTerm, CourseCode } from "@jevschedule/shared";
import type { StoreImport } from "../shared/workday-import.js";
import { mapAcademicRecord, mapCurrentRegistrations } from "../shared/workday-import.js";
import type { WorkdayImportProgress, WorkdayImportReview } from "../shared/ipc.js";
import type { Logger } from "./log/logger.js";
import type { HarvestTarget, HarvestWorkdayRequests } from "./workday-harvest.js";

/** Workday UI page for "View My Academic Record"; its data request is `academic-record-get`. */
const ACADEMIC_RECORD_UI_URL = "https://www.myworkday.com/lsu/d/task/2998$30300.htmld";
/** Workday UI page for "View My Courses"; its data request is `current-registrations-get`. */
const CURRENT_REGISTRATIONS_UI_URL = "https://www.myworkday.com/lsu/d/task/2998$28771.htmld";

export interface WorkdayImporterDependencies {
  launch: typeof launchWorkdayBrowser;
  waitForLogin: typeof waitForWorkdayLogin;
  teardown: typeof teardownWorkdayBrowser;
  /** Observes the signed-in Workday UI's own requests to learn their URL and session headers. */
  harvest: HarvestWorkdayRequests;
  fetch: typeof guardedFetch;
  log: Logger;
}

export interface WorkdayImporter {
  run(emit: (progress: WorkdayImportProgress) => void): Promise<WorkdayImportReview>;
}

function endpoint(id: string): AllowedEndpoint {
  const found = ALLOWED_ENDPOINTS.find((item) => item.id === id);
  if (!found) throw new Error("Workday endpoint is not configured");
  return found;
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

/**
 * Creates the main-process Workday importer (T-321). It signs in through a disposable browser,
 * harvests the session headers from the Workday UI's own data requests, re-reads each payload
 * only through `guardedFetch`, and maps it for review. Nothing is saved here: the renderer
 * confirms the review separately. Harvested header values stay in locals of `run` and never
 * reach a log line, a progress event, or the returned review.
 */
export function createWorkdayImporter(deps: WorkdayImporterDependencies): WorkdayImporter {
  /**
   * Fetches the harvested candidates for `target` through the guarded fetch and returns the
   * first payload `parse` accepts. Several UI requests can share one allowlisted URL shape, so
   * the payload is chosen by its parsed content rather than by URL.
   */
  async function readHarvested<T>(
    page: PageLike,
    target: HarvestTarget,
    parse: (json: unknown) => T,
  ): Promise<T> {
    const candidates = await deps.harvest(page, target);
    let failure: Error | undefined;
    for (const candidate of candidates) {
      // At runtime the signed-in page is a Playwright Page, which also satisfies the guard's page.
      const response = await deps.fetch(
        page as unknown as GuardedPage,
        { method: target.endpoint.method, url: candidate.url, headers: candidate.headers },
        [target.endpoint],
      );
      if (response.status < 200 || response.status >= 300) {
        failure ??= new Error("Workday could not provide the requested records");
        continue;
      }
      try {
        return parse(response.json);
      } catch (error) {
        if (!(error instanceof WorkdayShapeError)) throw error;
        failure = error;
      }
    }
    throw (
      failure ??
      new WorkdayShapeError("No Workday UI request returned the expected records", target.uiUrl)
    );
  }

  return {
    async run(emit) {
      let session: WorkdayBrowserSession | undefined;
      let stage = "signing-in";
      let reviewResult: WorkdayImportReview | undefined;
      let failed = false;
      let failure: unknown;
      emit({ stage: "signing-in" });
      deps.log.info("workday import", stage);
      try {
        session = await deps.launch({ startUrl: WORKDAY_TENANT_URL });
        const login = await deps.waitForLogin(session);
        if (login.status !== "success") throw new Error("Workday sign-in was not completed");

        stage = "fetching";
        emit({ stage: "fetching" });
        deps.log.info("workday import", stage);

        const academic = mapAcademicRecord(
          await readHarvested(
            login.page,
            { uiUrl: ACADEMIC_RECORD_UI_URL, endpoint: endpoint("academic-record-get") },
            parseAcademicRecord,
          ),
        );
        const registrations = mapCurrentRegistrations(
          await readHarvested(
            login.page,
            {
              uiUrl: CURRENT_REGISTRATIONS_UI_URL,
              endpoint: endpoint("current-registrations-get"),
            },
            parseCurrentRegistrations,
          ),
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
        if (session) {
          try {
            await deps.teardown(session);
          } catch (error) {
            if (!failed) {
              failed = true;
              failure = error;
              emit({ stage: "error", message: "Could not import records from Workday." });
              deps.log.warn("workday import", "error", { previousStage: "teardown" });
            }
          }
        }
      }
      if (failed) throw failure;
      if (!reviewResult) throw new Error("Workday import did not produce a review");
      return reviewResult;
    },
  };
}
