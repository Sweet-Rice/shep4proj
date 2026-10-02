import { z } from "zod";

/** Department prefix, one space, four-digit number and optional one- or two-letter suffix. A suffixed transcript code denotes the same course as its base catalog code. */
export const CourseCodeSchema = z.string().regex(/^[A-Z]{2,4} \d{4}[A-Z]{0,2}$/);

export type CourseCode = z.infer<typeof CourseCodeSchema>;

/** Return the base catalog code for a transcript code with an optional suffix. */
export function toCatalogCode(code: CourseCode): CourseCode {
  return code.replace(/[A-Z]{1,2}$/, "") as CourseCode;
}
