import { z } from "zod";
import { CatalogYearSchema } from "./catalog-year.js";
import { CourseCodeSchema } from "./course-code.js";
import { LetterGradeSchema } from "./grade.js";

const SlugSchema = z.string().regex(/^[a-z0-9-]+$/);

/** A specific course, optionally with the minimum letter grade that counts. */
export const CourseRefSchema = z.object({
  code: CourseCodeSchema,
  minGrade: LetterGradeSchema.nullable().default(null),
});

const requirementBase = {
  id: SlugSchema,
  label: z.string().min(1),
  /** Suggested semester (1-8) in the degree flowchart, or null when unplaced. */
  semester: z.number().int().min(1).max(8).nullable().default(null),
};

/** Every listed course is required. */
export const FixedRequirementSchema = z.object({
  kind: z.literal("fixed"),
  ...requirementBase,
  courses: z.array(CourseRefSchema).min(1),
});

/** Pick `n` of the listed options. */
export const ChooseNRequirementSchema = z.object({
  kind: z.literal("chooseN"),
  ...requirementBase,
  n: z.number().int().min(1),
  options: z.array(CourseRefSchema).min(2),
});

/** A credit-hour slot filled by any course in a category (e.g. general education). */
export const CreditBucketRequirementSchema = z.object({
  kind: z.literal("creditBucket"),
  ...requirementBase,
  credits: z.number().positive(),
  category: z.string().min(1),
  /** Courses known to satisfy the bucket; empty when the catalog does not enumerate them. */
  eligibleCourses: z.array(CourseRefSchema).default([]),
});

export const RequirementSchema = z.discriminatedUnion("kind", [
  FixedRequirementSchema,
  ChooseNRequirementSchema,
  CreditBucketRequirementSchema,
]);

/** One degree program (concentration) for one catalog year. */
export const DegreeProgramSchema = z
  .object({
    id: SlugSchema,
    program: z.string().min(1),
    concentration: z.string().min(1),
    catalogYear: CatalogYearSchema,
    totalCredits: z.number().int().positive(),
    source: z.string().url(),
    requirements: z.array(RequirementSchema).min(1),
  })
  .superRefine((program, ctx) => {
    const seen = new Set<string>();
    program.requirements.forEach((requirement, index) => {
      if (seen.has(requirement.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `duplicate requirement id: ${requirement.id}`,
          path: ["requirements", index, "id"],
        });
      }
      seen.add(requirement.id);

      if (requirement.kind === "chooseN" && requirement.n > requirement.options.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `chooseN ${requirement.id}: n exceeds options`,
          path: ["requirements", index, "n"],
        });
      }
    });
  });

export type CourseRef = z.infer<typeof CourseRefSchema>;
export type FixedRequirement = z.infer<typeof FixedRequirementSchema>;
export type ChooseNRequirement = z.infer<typeof ChooseNRequirementSchema>;
export type CreditBucketRequirement = z.infer<typeof CreditBucketRequirementSchema>;
export type Requirement = z.infer<typeof RequirementSchema>;
export type DegreeProgram = z.infer<typeof DegreeProgramSchema>;
