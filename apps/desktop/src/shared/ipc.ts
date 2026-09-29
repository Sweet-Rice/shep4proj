import type { CourseCode } from "@jevschedule/shared";

/**
 * IPC channel names shared by the main process and the preload script. Keeping them in one
 * place means a renamed channel breaks the build instead of silently never answering.
 */
export const IPC_CHANNELS = {
  completedGet: "completed:get",
  completedSet: "completed:set",
} as const;

/**
 * The API the preload exposes to the renderer as `window.jevschedule`. The renderer has no
 * Node or filesystem access (sandboxed, T-022), so everything local goes through here.
 */
export interface JevscheduleApi {
  completed: {
    get(): Promise<CourseCode[]>;
    set(code: CourseCode, completed: boolean): Promise<void>;
  };
}
