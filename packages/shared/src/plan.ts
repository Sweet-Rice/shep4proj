import { z } from "zod";
import { CourseCodeSchema } from "./course-code.js";

/** Academic season, matching the seasons Workday reports (see packages/workday `Season`). */
export const SeasonSchema = z.enum(["Spring", "Summer", "Fall", "Winter"]);

export type Season = z.infer<typeof SeasonSchema>;

/** One future term in a plan and the courses the student intends to take in it. */
export const PlanTermSchema = z.object({
  season: SeasonSchema,
  year: z.number().int().min(2000).max(2100),
  courses: z.array(CourseCodeSchema),
});

export type PlanTerm = z.infer<typeof PlanTermSchema>;

/**
 * A student's semester-by-semester plan (US-08), in the order the student arranged it. Each
 * term appears once and each course is planned at most once across the whole plan; whether
 * the order respects prerequisites is `validatePlan`'s job (T-233), not the schema's.
 */
export const PlanSchema = z
  .object({
    terms: z.array(PlanTermSchema),
  })
  .superRefine((plan, ctx) => {
    const seenTerms = new Set<string>();
    const seenCourses = new Set<string>();
    plan.terms.forEach((term, termIndex) => {
      const termKey = `${term.season} ${term.year}`;
      if (seenTerms.has(termKey)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `duplicate term: ${termKey}`,
          path: ["terms", termIndex],
        });
      }
      seenTerms.add(termKey);

      term.courses.forEach((code, courseIndex) => {
        if (seenCourses.has(code)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `course planned more than once: ${code}`,
            path: ["terms", termIndex, "courses", courseIndex],
          });
        }
        seenCourses.add(code);
      });
    });
  });

export type Plan = z.infer<typeof PlanSchema>;
