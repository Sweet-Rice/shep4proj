import { z } from "zod";

/** Passing letter grades a requirement can demand as a minimum. */
export const LetterGradeSchema = z.enum(["A", "B", "C", "D"]);

export type LetterGrade = z.infer<typeof LetterGradeSchema>;
