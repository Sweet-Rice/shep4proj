import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { CourseCodeSchema, type CourseCode } from "./course-code.js";
import type { CompletedInput } from "./evaluate-requirements.js";
import { PlanSchema } from "./plan.js";
import type { PlannerTools } from "./planner-tools.js";
import type { ValidationPlan } from "./validate-plan.js";

/**
 * Arguments supplied by an external planner client. The host loads the degree,
 * completed courses, and catalog data for the facade; clients cannot supply
 * student records. For plan calls, the host enriches `plan` with course details
 * before calling `validatePlan` or `proposePlan`.
 */
export const PlannerToolInputSchemas = {
  getCompleted: z.object({}).strict(),
  getRemainingRequirements: z.object({}).strict(),
  getEligible: z.object({ courseCodes: z.array(CourseCodeSchema).min(1).optional() }).strict(),
  getHistory: z.object({ code: CourseCodeSchema }).strict(),
  validatePlan: z.object({ plan: PlanSchema }).strict(),
  proposePlan: z.object({ plan: PlanSchema }).strict(),
} as const;

const descriptions: Record<keyof typeof PlannerToolInputSchemas, string> = {
  getCompleted: "List completed course codes from the student's local store.",
  getRemainingRequirements: "Show requirements remaining in the student's current degree.",
  getEligible: "Check eligibility for catalog courses, optionally limited to course codes.",
  getHistory: "Show archived offering history for a course.",
  validatePlan: "Validate a candidate semester plan without changing the saved plan.",
  proposePlan: "Return a validated plan proposal for student review; never save it.",
};

export type PlannerToolName = keyof typeof PlannerToolInputSchemas;

export interface PlannerToolDefinition {
  name: PlannerToolName;
  description: string;
  inputSchema: ReturnType<typeof zodToJsonSchema>;
}

/** JSON Schema is derived from the runtime Zod validators during the shared build. */
export function getPlannerToolDefinitions(): PlannerToolDefinition[] {
  return (Object.keys(PlannerToolInputSchemas) as PlannerToolName[]).map((name) => ({
    name,
    description: descriptions[name],
    inputSchema: zodToJsonSchema(PlannerToolInputSchemas[name], { target: "jsonSchema7" }),
  }));
}

/** The default external view excludes grades; grade sharing needs separate consent. */
export function publicCompletedCodes(completed: readonly CompletedInput[]): CourseCode[] {
  return completed.map((item) => (typeof item === "string" ? item : item.code));
}

/**
 * A proposal is returned only after validation; this helper never writes to a store.
 * The generated JSON Schema cannot express `PlanSchema`'s unique-term and unique-course
 * rules, so they are enforced here and reported in `schemaErrors`.
 */
export function proposePlan(
  tools: Pick<PlannerTools, "validatePlan">,
  plan: ValidationPlan,
  completed: CompletedInput[] | Set<CourseCode>,
) {
  const validation = tools.validatePlan(plan, completed);
  const parsed = PlanSchema.safeParse({ creditLimit: plan.creditLimit, terms: plan.terms });
  const schemaErrors = parsed.success ? [] : parsed.error.issues.map(({ message }) => message);
  return { proposal: validation.valid && parsed.success ? plan : null, validation, schemaErrors };
}
