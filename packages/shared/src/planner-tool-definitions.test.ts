import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createPlannerTools } from "./planner-tools.js";
import {
  getPlannerToolDefinitions,
  PlannerToolInputSchemas,
  proposePlan,
  publicCompletedCodes,
} from "./planner-tool-definitions.js";
import type { ValidationPlan } from "./validate-plan.js";

describe("planner tool definitions", () => {
  it("generates stable JSON schemas for every facade method and proposePlan", () => {
    const definitions = getPlannerToolDefinitions();
    const snapshot = readFileSync(
      new URL("./__snapshots__/planner-tool-schemas.json", import.meta.url),
      "utf8",
    );
    const builtSchemas = readFileSync(
      new URL("../dist/planner-tool-schemas.json", import.meta.url),
      "utf8",
    );

    expect(definitions.map(({ name }) => name)).toEqual([
      "getCompleted",
      "getRemainingRequirements",
      "getEligible",
      "getHistory",
      "validatePlan",
      "proposePlan",
    ]);
    expect(
      definitions.every(
        ({ inputSchema }) => "type" in inputSchema && inputSchema.type === "object",
      ),
    ).toBe(true);
    expect(definitions).toEqual(JSON.parse(snapshot));
    expect(JSON.parse(builtSchemas)).toEqual(definitions);
  });

  it("accepts only public tool arguments", () => {
    expect(PlannerToolInputSchemas.getCompleted.safeParse({ grade: "A" }).success).toBe(false);
    expect(PlannerToolInputSchemas.getHistory.safeParse({ code: "CSC 1350" }).success).toBe(true);
    expect(PlannerToolInputSchemas.getHistory.safeParse({ code: "CSC 135" }).success).toBe(false);
    expect(
      PlannerToolInputSchemas.getEligible.safeParse({ courseCodes: ["CSC 1350"] }).success,
    ).toBe(true);
  });

  it("excludes grades from the default completed-course view", () => {
    expect(publicCompletedCodes([{ code: "CSC 1350", grade: "A" }, "CSC 1351"])).toEqual([
      "CSC 1350",
      "CSC 1351",
    ]);
  });

  it("returns only valid proposals and never writes a plan", () => {
    const tools = createPlannerTools();
    const plan: ValidationPlan = {
      creditLimit: 4,
      terms: [{ season: "Fall", year: 2027, courses: ["CSC 1350"] }],
      courseDetails: {
        "CSC 1350": {
          code: "CSC 1350",
          credits: { min: 4, max: 4, note: null },
          prereq: { tree: null, needsReview: false },
        },
      },
    };

    expect(proposePlan(tools, plan, []).proposal).toEqual(plan);
    const invalid = proposePlan(tools, { ...plan, creditLimit: 3 }, []);
    expect(invalid.proposal).toBeNull();
    expect(invalid.validation.issues.map(({ type }) => type)).toEqual(["credit_limit"]);
  });
});
