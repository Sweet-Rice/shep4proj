import { createPlannerTools } from "@jevschedule/shared";

/** Renderer adapter for shared planner queries backed by the local completed store. */
export const plannerTools = createPlannerTools({
  getCompleted: () => window.jevschedule.completed.get(),
});
