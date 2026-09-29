import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { CourseCodeSchema, PlanSchema } from "@jevschedule/shared";
import { z } from "zod";
import { IPC_CHANNELS } from "../shared/ipc.js";
import type { CompletedStore } from "./store/completed.js";
import type { PlanStore } from "./store/plan.js";

/** Stores the IPC handlers read and write. */
export interface IpcStores {
  completed: CompletedStore;
  plan: PlanStore;
}

/** Thrown when an IPC call comes from a frame that isn't the app's own renderer. */
export class UntrustedIpcSenderError extends Error {
  constructor(readonly channel: string) {
    super(`rejected IPC call on ${channel} from an untrusted sender`);
    this.name = "UntrustedIpcSenderError";
  }
}

const CompletedSetArgsSchema = z.tuple([CourseCodeSchema, z.boolean()]);
const PlanSaveArgsSchema = z.tuple([PlanSchema]);

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
): void {
  function handle(channel: string, handler: (args: unknown[]) => unknown): void {
    ipcMain.handle(channel, (event, ...args: unknown[]) => {
      if (!isTrustedSender(event)) throw new UntrustedIpcSenderError(channel);
      return handler(args);
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
}
