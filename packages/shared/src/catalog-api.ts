import { z } from "zod";
import { CourseSchema } from "./course.js";
import { DegreeProgramSchema } from "./requirements.js";
import { PrereqRecordSchema } from "./prereq-record.js";

export const CourseDetailSchema = CourseSchema.extend({
  prereq: PrereqRecordSchema.omit({ rawText: true }),
});
export type CourseDetail = z.infer<typeof CourseDetailSchema>;

export const DegreeSummarySchema = DegreeProgramSchema.innerType().pick({
  id: true,
  program: true,
  concentration: true,
  catalogYear: true,
  totalCredits: true,
});
export type DegreeSummary = z.infer<typeof DegreeSummarySchema>;
