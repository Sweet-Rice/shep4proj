import type { IpcMain, IpcMainInvokeEvent } from "electron";
import {
  AcademicPeriodIdSchema,
  CourseCodeSchema,
  PlanSchema,
  PlanTermSchema,
  type CourseCode,
} from "@jevschedule/shared";
import type { TranscriptParseResult } from "@jevschedule/workday";
import { z } from "zod";
import { IPC_CHANNELS } from "../shared/ipc.js";
import type { CatalogClient } from "./catalog.js";
import type { CompletedStore } from "./store/completed.js";
import type { PlanStore } from "./store/plan.js";
import type { WorkdayImporter } from "./workday-import.js";
/** Stores and services the handlers read. */
export interface IpcStores {
  completed: CompletedStore;
  plan: PlanStore;
  catalog: CatalogClient;
}

export interface IpcServices {
  workday?: WorkdayImporter;
}

/** Thrown when an IPC call comes from a frame that isn't the app's own renderer. */
export class UntrustedIpcSenderError extends Error {
  constructor(readonly channel: string) {
    super(`rejected IPC call on ${channel} from an untrusted sender`);
    this.name = "UntrustedIpcSenderError";
  }
}

const CompletedSetArgsSchema = z.tuple([CourseCodeSchema, z.boolean()]);
const WorkdayReviewSchema = z.object({
  completed: z.array(CourseCodeSchema),
  inProgress: z.array(PlanTermSchema),
  skipped: z.array(z.object({ code: z.string(), reason: z.string() })),
});
const PlanSaveArgsSchema = z.tuple([PlanSchema]);
const CatalogCourseDetailsArgsSchema = z.tuple([z.array(CourseCodeSchema).max(500)]);
const CatalogCourseHistoryArgsSchema = z.tuple([CourseCodeSchema]);
const CatalogSectionsArgsSchema = z.tuple([CourseCodeSchema, AcademicPeriodIdSchema]);
const CatalogDegreeArgsSchema = z.tuple([z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)]);
/**
 * Whether `frameUrl` is the app's own renderer at `rendererUrl`: the same origin for the dev
 * server, or the same file (ignoring query and hash) for the packaged `file://` build.
 */
export function isAppRendererUrl(frameUrl: string | undefined, rendererUrl: string): boolean {
  if (!frameUrl) return false;
  let actual: URL;
  try {
    actual = new URL(frameUrl);
  } catch {
    return false;
  }
  const expected = new URL(rendererUrl);
  if (expected.protocol === "file:") {
    return actual.protocol === "file:" && actual.pathname === expected.pathname;
  }
  return actual.origin === expected.origin;
}

/**
 * Registers every main-process IPC handler. Renderer input is untrusted: each call must come
 * from a frame `isTrustedSender` accepts, and arguments are validated with zod before they
 * reach a store.
 */
export function registerIpcHandlers(
  ipcMain: Pick<IpcMain, "handle">,
  stores: IpcStores,
  isTrustedSender: (event: IpcMainInvokeEvent) => boolean,
  selectTranscript: () => Promise<TranscriptParseResult | null> = async () => null,
  services: IpcServices = {},
): void {
  function handle(
    channel: string,
    handler: (args: unknown[], event: IpcMainInvokeEvent) => unknown,
  ): void {
    ipcMain.handle(channel, (event, ...args: unknown[]) => {
      if (!isTrustedSender(event)) throw new UntrustedIpcSenderError(channel);
      return handler(args, event);
    });
  }

  handle(IPC_CHANNELS.completedGet, () => stores.completed.getCompleted());
  handle(IPC_CHANNELS.completedSet, (args) => {
    const [code, completed] = CompletedSetArgsSchema.parse(args);
    stores.completed.setCompleted(code, completed);
  });
  handle(IPC_CHANNELS.planGet, () => stores.plan.getPlan());
  handle(IPC_CHANNELS.planSave, (args) => {
    const [plan] = PlanSaveArgsSchema.parse(args);
    stores.plan.savePlan(plan);
  });
  handle(IPC_CHANNELS.transcriptSelect, (args) => {
    z.tuple([]).parse(args);
    return selectTranscript();
  });
  handle(IPC_CHANNELS.catalogCourses, (args) => {
    z.tuple([]).parse(args);
    return stores.catalog.listCourses();
  });
  handle(IPC_CHANNELS.catalogCourseDetails, (args) => {
    const [codes] = CatalogCourseDetailsArgsSchema.parse(args);
    return stores.catalog.getCourseDetails(codes);
  });
  handle(IPC_CHANNELS.catalogCourseHistory, (args) => {
    const [code] = CatalogCourseHistoryArgsSchema.parse(args);
    return stores.catalog.getCourseHistory(code);
  });
  handle(IPC_CHANNELS.catalogDegrees, (args) => {
    z.tuple([]).parse(args);
    return stores.catalog.listDegrees();
  });
  handle(IPC_CHANNELS.catalogDegree, (args) => {
    const [id] = CatalogDegreeArgsSchema.parse(args);
    return stores.catalog.getDegree(id);
  });
  handle(IPC_CHANNELS.catalogSections, (args) => {
    const [courseCode, term] = CatalogSectionsArgsSchema.parse(args);
    return stores.catalog.listSections(courseCode, term);
  });
  handle(IPC_CHANNELS.workdayImport, (args, event) => {
    z.tuple([]).parse(args);
    if (!services.workday) throw new Error("Workday importer is unavailable");
    return services.workday.run((progress) => {
      event.sender.send(IPC_CHANNELS.workdayProgress, progress);
    });
  });
  handle(IPC_CHANNELS.workdayConfirm, (args, event) => {
    const [review] = z.tuple([WorkdayReviewSchema]).parse(args);
    for (const code of review.completed) stores.completed.setCompleted(code, true);

    const plan = stores.plan.getPlan();
    const plannedCodes = new Set<CourseCode>(plan.terms.flatMap((term) => term.courses));
    for (const importedTerm of review.inProgress) {
      const courses: CourseCode[] = [];
      for (const code of importedTerm.courses) {
        if (plannedCodes.has(code)) continue;
        plannedCodes.add(code);
        courses.push(code);
      }
      if (courses.length === 0) continue;
      const existing = plan.terms.find(
        (term) => term.season === importedTerm.season && term.year === importedTerm.year,
      );
      if (existing) existing.courses.push(...courses);
      else plan.terms.push({ ...importedTerm, courses });
      courses.forEach((code) => plannedCodes.add(code));
    }
    stores.plan.savePlan(plan);
    event.sender.send(IPC_CHANNELS.workdayProgress, { stage: "done" });
  });
}
