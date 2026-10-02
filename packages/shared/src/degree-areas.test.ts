import { describe, expect, it } from "vitest";
import { evaluateRequirements } from "./evaluate-requirements.js";
import { groupRequirementsByArea } from "./degree-areas.js";
import { DegreeProgramSchema } from "./requirements.js";

const program = DegreeProgramSchema.parse({
  id: "area-test",
  program: "Test degree",
  concentration: "General",
  catalogYear: "2026-2027",
  totalCredits: 120,
  source: "https://example.com",
  requirements: [
    {
      kind: "fixed",
      id: "core",
      label: "Core",
      area: "Computer Science",
      semester: 1,
      courses: [{ code: "CSC 1350" }, { code: "CSC 1351" }],
    },
    {
      kind: "chooseN",
      id: "options",
      label: "Options",
      area: "Computer Science",
      semester: 2,
      n: 2,
      options: [{ code: "CSC 2259" }, { code: "CSC 3102" }, { code: "CSC 3200" }],
    },
    {
      kind: "creditBucket",
      id: "science-a",
      label: "Science A",
      area: "Natural Sciences",
      semester: 1,
      credits: 3,
      category: "Natural Sciences",
      eligibleCourses: [{ code: "BIOL 1001" }],
    },
    {
      kind: "creditBucket",
      id: "science-b",
      label: "Science B",
      area: "Natural Sciences",
      semester: 2,
      credits: 2,
      category: "Natural Sciences",
      eligibleCourses: [{ code: "CHEM 1201" }],
    },
  ],
});

describe("groupRequirementsByArea", () => {
  it("preserves first appearance order and aggregates course requirements with chooseN caps", () => {
    const groups = groupRequirementsByArea(
      evaluateRequirements(program, ["CSC 1350", "CSC 2259", "CSC 3102", "CSC 3200"]),
    );
    expect(groups.map(({ area }) => area)).toEqual(["Computer Science", "Natural Sciences"]);
    expect(groups[0]).toMatchObject({
      unit: "courses",
      required: 4,
      fulfilled: 3,
      status: "partially_satisfied",
    });
    if (groups[0]?.unit !== "courses") throw new Error("expected course group");
    expect(groups[0].completed.map(({ code }) => code)).toEqual([
      "CSC 1350",
      "CSC 2259",
      "CSC 3102",
    ]);
    expect(groups[0].remaining.map(({ code }) => code)).toEqual(["CSC 1351"]);
    expect(groups[0].choices).toEqual([]);
  });

  it("aggregates same-category credit buckets and reports status transitions", () => {
    const groups = groupRequirementsByArea(evaluateRequirements(program, ["BIOL 1001"]));
    const science = groups[1];
    expect(science).toMatchObject({
      unit: "credits",
      required: 5,
      fulfilled: 3,
      status: "partially_satisfied",
    });
    if (science?.unit !== "credits") throw new Error("expected credit group");
    expect(science.slots).toHaveLength(1);
    expect(science.slots[0]).toMatchObject({
      category: "Natural Sciences",
      requiredCredits: 5,
      fulfilledCredits: 3,
    });
    expect(
      groupRequirementsByArea(
        evaluateRequirements(program, [
          "CSC 1350",
          "CSC 1351",
          "CSC 2259",
          "CSC 3102",
          "BIOL 1001",
          "CHEM 1201",
        ]),
      ).map((area) => area.status),
    ).toEqual(["satisfied", "satisfied"]);
    expect(
      groupRequirementsByArea(evaluateRequirements(program, [])).map((area) => area.status),
    ).toEqual(["unsatisfied", "unsatisfied"]);
  });

  it("caps fulfilled chooseN courses and preserves uncompleted options", () => {
    const chooseDegree = DegreeProgramSchema.parse({
      ...program,
      requirements: [program.requirements[1]],
    });
    const [partial] = groupRequirementsByArea(evaluateRequirements(chooseDegree, ["CSC 2259"]));
    expect(partial).toMatchObject({
      unit: "courses",
      required: 2,
      fulfilled: 1,
      status: "partially_satisfied",
    });
    if (partial?.unit !== "courses") throw new Error("expected course group");
    expect(partial.choices).toEqual([
      {
        n: 2,
        remaining: 1,
        options: [
          { code: "CSC 3102", minGrade: null },
          { code: "CSC 3200", minGrade: null },
        ],
      },
    ]);

    const [satisfied] = groupRequirementsByArea(
      evaluateRequirements(chooseDegree, ["CSC 2259", "CSC 3102", "CSC 3200"]),
    );
    expect(satisfied).toMatchObject({
      unit: "courses",
      required: 2,
      fulfilled: 2,
      status: "satisfied",
    });
  });
});
