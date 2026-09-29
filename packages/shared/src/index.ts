/** Package identifier, used to prove cross-package builds work. */
export const PACKAGE_NAME = "@jevschedule/shared";

export { CourseSchema } from "./course.js";
export type { Course } from "./course.js";
export { DegreeSchema } from "./degree.js";
export type { Degree } from "./degree.js";

/**
 * Placeholder for the shared planner types, zod schemas, and prereq /
 * requirement / eligibility / conflict logic that will live in this package.
 */
export function greet(name: string): string {
  return `Hello, ${name}, from ${PACKAGE_NAME}`;
}
