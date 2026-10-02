import { createPlannerTools } from "@jevschedule/shared";

/** Renderer adapter for shared planner queries backed by local stores and catalog history. */
export const plannerTools = createPlannerTools({
  getCompleted: () => window.jevschedule.completed.get(),
  getHistory: (code) => window.jevschedule.catalog.getCourseHistory(code),
});
