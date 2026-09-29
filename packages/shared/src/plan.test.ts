import { describe, expect, it } from "vitest";
import { DEFAULT_CREDIT_LIMIT, PlanSchema, type Plan } from "./plan.js";

const plan: Plan = {
  creditLimit: 18,
  terms: [
    { season: "Fall", year: 2027, courses: ["CSC 3102", "CSC 3380"] },
    { season: "Spring", year: 2028, courses: ["CSC 4330"] },
    { season: "Summer", year: 2028, courses: [] },
  ],
};

describe("PlanSchema", () => {
  it("accepts a well-formed plan", () => {
    expect(PlanSchema.parse(plan)).toEqual(plan);
  });

  it("accepts an empty plan", () => {
    expect(PlanSchema.parse({ creditLimit: 19, terms: [] })).toEqual({
      creditLimit: 19,
      terms: [],
    });
  });

  it("rejects the same term twice", () => {
    const result = PlanSchema.safeParse({
      creditLimit: 19,
      terms: [
        { season: "Fall", year: 2027, courses: [] },
        { season: "Fall", year: 2027, courses: [] },
      ],
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]).toMatchObject({
      message: "duplicate term: Fall 2027",
      path: ["terms", 1],
    });
  });

  it("rejects a course planned in two terms", () => {
    const result = PlanSchema.safeParse({
      creditLimit: 19,
      terms: [
        { season: "Fall", year: 2027, courses: ["CSC 3102"] },
        { season: "Spring", year: 2028, courses: ["CSC 3102"] },
      ],
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]).toMatchObject({
      message: "course planned more than once: CSC 3102",
      path: ["terms", 1, "courses", 0],
    });
  });

  it.each([
    ["an unknown season", { season: "Autumn", year: 2027, courses: [] }],
    ["a fractional year", { season: "Fall", year: 2027.5, courses: [] }],
    ["a malformed course code", { season: "Fall", year: 2027, courses: ["csc3102"] }],
  ])("rejects %s", (_label, term) => {
    expect(PlanSchema.safeParse({ creditLimit: 19, terms: [term] }).success).toBe(false);
  });

  it.each([
    ["a missing credit limit", { terms: [] }],
    ["a zero credit limit", { creditLimit: 0, terms: [] }],
    ["a fractional credit limit", { creditLimit: 18.5, terms: [] }],
  ])("rejects %s", (_label, candidate) => {
    expect(PlanSchema.safeParse(candidate).success).toBe(false);
  });
});

describe("DEFAULT_CREDIT_LIMIT", () => {
  it("is a valid credit limit", () => {
    expect(PlanSchema.safeParse({ creditLimit: DEFAULT_CREDIT_LIMIT, terms: [] }).success).toBe(
      true,
    );
  });
});
