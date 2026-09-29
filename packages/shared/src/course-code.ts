import { z } from "zod";

/** Catalog course code: department prefix, one space, four-digit number (e.g. "CSC 4330"). */
export const CourseCodeSchema = z.string().regex(/^[A-Z]{2,4} \d{4}$/);

export type CourseCode = z.infer<typeof CourseCodeSchema>;
