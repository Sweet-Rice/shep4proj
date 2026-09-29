import { z } from "zod";

export const DegreeSchema = z.object({
  id: z.string().trim().min(1),
  title: z.string().trim().min(1),
  concentrations: z.array(z.string()).optional(),
  requiredCourses: z.array(z.string()).optional(),
  electives: z.array(z.string()).optional(),
});

export type Degree = z.infer<typeof DegreeSchema>;
