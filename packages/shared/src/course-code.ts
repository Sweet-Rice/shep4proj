import { z } from "zod";

/** Department prefix, one space, four-digit number, optional one- or two-letter suffix (e.g. "CSC 4330", "CSC 4330G", "CSC 4890GE"). A suffixed code is a distinct course; it never satisfies the base course's prerequisites or requirements. */
export const CourseCodeSchema = z.string().regex(/^[A-Z]{2,4} \d{4}[A-Z]{0,2}$/);

export type CourseCode = z.infer<typeof CourseCodeSchema>;
