import type { JevscheduleApi } from "../../shared/ipc.js";

declare global {
  interface Window {
    /** Local store API from the preload script (see src/shared/ipc.ts). */
    jevschedule: JevscheduleApi;
  }
}
