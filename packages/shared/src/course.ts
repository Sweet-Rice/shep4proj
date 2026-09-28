import { z } from "zod";

/** Public catalog course data shared by the API and desktop app. */
export const CourseSchema = z.object({
  code: z.string().trim().min(1),
  title: z.string().trim().min(1),
  credits: z.number().finite().nonnegative(),
  description: z.string().trim().min(1),
  /** Original catalog wording, retained for prerequisite parsing and review. */
  prerequisiteText: z.string().nullable(),
});

export type Course = z.infer<typeof CourseSchema>;
