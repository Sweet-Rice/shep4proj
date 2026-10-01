import { describe, expect, it } from "vitest";
import { evaluateRequirements } from "./evaluate-requirements.js";
import type { EvaluatedFixedRequirement } from "./evaluate-requirements.js";
import { DegreeProgramSchema } from "./requirements.js";

const sampleDegree = DegreeProgramSchema.parse({
  id: "csc-test-degree",
  program: "Computer Science, B.S.",
  concentration: "Software Engineering",
  catalogYear: "2026-2027",
  totalCredits: 120,
  source: "https://catalog.lsu.edu/preview_program.php?catoid=35&poid=14278",
  requirements: [
    {
      kind: "fixed",
      id: "req-fixed-core",
      label: "Core CSC",
      semester: 1,
      courses: [{ code: "CSC 1350" }, { code: "MATH 1550", minGrade: "C" }],
    },
    {
      kind: "chooseN",
      id: "req-choose-math",
      label: "Choose Math Option",
      semester: 2,
      n: 1,
      options: [
        { code: "MATH 1552" },
        { code: "MATH 1550" }, // Intentionally duplicate option to test double-counting with fixed
      ],
    },
    {
      kind: "creditBucket",
      id: "req-bucket-gened",
      label: "General Education Natural Science",
      semester: 3,
      credits: 6,
      category: "Natural Sciences",
      eligibleCourses: [{ code: "BIOL 1001" }, { code: "BIOL 1002" }, { code: "CHEM 1201" }],
    },
    {
      kind: "creditBucket",
      id: "req-bucket-open",
      label: "General Elective",
      semester: 4,
      credits: 3,
      category: "Free Elective",
      eligibleCourses: [],
    },
  ],
});

describe("evaluateRequirements", () => {
  it("returns all unsatisfied requirements when no courses are completed", () => {
    const result = evaluateRequirements(sampleDegree, []);

    expect(result.degreeId).toBe("csc-test-degree");
    expect(result.isSatisfied).toBe(false);
    expect(result.totalCreditsFulfilled).toBe(0);
    expect(result.unusedCompletedCourses).toEqual([]);

    expect(result.requirements[0]).toMatchObject({
      id: "req-fixed-core",
      status: "unsatisfied",
      isSatisfied: false,
      fulfilledCourses: [],
      missingCourses: [{ code: "CSC 1350" }, { code: "MATH 1550" }],
    });

    expect(result.requirements[1]).toMatchObject({
      id: "req-choose-math",
      status: "unsatisfied",
      isSatisfied: false,
      fulfilledOptions: [],
      missingCount: 1,
    });
  });

  it("evaluates fixed requirements correctly when completed", () => {
    const result = evaluateRequirements(sampleDegree, ["CSC 1350", "MATH 1550"]);

    const fixed = result.requirements[0]! as EvaluatedFixedRequirement;
    expect(fixed.isSatisfied).toBe(true);
    expect(fixed.status).toBe("satisfied");
    expect(fixed.fulfilledCourses).toHaveLength(2);
    expect(fixed.missingCourses).toHaveLength(0);
  });
  it("reports fixed requirements as partial when some required courses are completed", () => {
    const oneCourse = evaluateRequirements(sampleDegree, ["CSC 1350"]);
    expect(oneCourse.requirements[0]).toMatchObject({
      status: "partially_satisfied",
      isSatisfied: false,
      fulfilledCourses: [{ code: "CSC 1350" }],
      missingCourses: [{ code: "MATH 1550", minGrade: "C" }],
    });

    const allCourses = evaluateRequirements(sampleDegree, ["CSC 1350", "MATH 1550"]);
    expect(allCourses.requirements[0]).toMatchObject({
      status: "satisfied",
      isSatisfied: true,
      missingCourses: [],
    });

    const noCourses = evaluateRequirements(sampleDegree, []);
    expect(noCourses.requirements[0]).toMatchObject({
      status: "unsatisfied",
      isSatisfied: false,
      fulfilledCourses: [],
      missingCourses: [{ code: "CSC 1350" }, { code: "MATH 1550", minGrade: "C" }],
    });
  });


  it("enforces minimum letter grade on fixed requirements", () => {
    // MATH 1550 requires minGrade "C". A grade of "D" should fail.
    const failedResult = evaluateRequirements(sampleDegree, [
      { code: "CSC 1350" },
      { code: "MATH 1550", grade: "D" },
    ]);

    const fixedFailed = failedResult.requirements[0]! as EvaluatedFixedRequirement;
    expect(fixedFailed.isSatisfied).toBe(false);
    expect(fixedFailed.status).toBe("partially_satisfied");
    expect(fixedFailed.missingCourses).toEqual([{ code: "MATH 1550", minGrade: "C" }]);

    // A grade of "B" should pass.
    const passedResult = evaluateRequirements(sampleDegree, [
      { code: "CSC 1350" },
      { code: "MATH 1550", grade: "B" },
    ]);

    const fixedPassed = passedResult.requirements[0]! as EvaluatedFixedRequirement;
    expect(fixedPassed.isSatisfied).toBe(true);
  });

  it("prevents double-counting between fixed and chooseN requirements", () => {
    // MATH 1550 is in Fixed AND in ChooseN.
    // Completing MATH 1550 should satisfy Fixed, NOT double-count to ChooseN.
    const result = evaluateRequirements(sampleDegree, ["MATH 1550", "CSC 1350"]);

    const fixed = result.requirements[0]!;
    const chooseN = result.requirements[1]!;

    expect(fixed.isSatisfied).toBe(true);
    // ChooseN should be unsatisfied because MATH 1550 was consumed by Fixed
    expect(chooseN.isSatisfied).toBe(false);
    expect(chooseN.status).toBe("unsatisfied");

    // If student ALSO completes MATH 1552, ChooseN should be satisfied
    const resultWithMath2 = evaluateRequirements(sampleDegree, [
      "MATH 1550",
      "CSC 1350",
      "MATH 1552",
    ]);

    expect(resultWithMath2.requirements[0]!.isSatisfied).toBe(true);
    expect(resultWithMath2.requirements[1]!.isSatisfied).toBe(true);
  });

  it("prevents double-counting between fixed and credit buckets", () => {
    // Create degree where BIOL 1001 is fixed AND eligible for credit bucket
    const degree = DegreeProgramSchema.parse({
      ...sampleDegree,
      requirements: [
        {
          kind: "fixed",
          id: "req-fixed-biol",
          label: "Biology",
          semester: 1,
          courses: [{ code: "BIOL 1001" }],
        },
        {
          kind: "creditBucket",
          id: "req-bucket-sci",
          label: "Science",
          semester: 2,
          credits: 3,
          category: "Natural Sciences",
          eligibleCourses: [{ code: "BIOL 1001" }, { code: "CHEM 1201" }],
        },
      ],
    });

    // Student only took BIOL 1001
    const result1 = evaluateRequirements(degree, ["BIOL 1001"]);
    expect(result1.requirements[0]!.isSatisfied).toBe(true);
    expect(result1.requirements[1]!.isSatisfied).toBe(false); // Bucket not filled because BIOL 1001 consumed

    // Student took BIOL 1001 and CHEM 1201
    const result2 = evaluateRequirements(degree, ["BIOL 1001", "CHEM 1201"]);
    expect(result2.requirements[0]!.isSatisfied).toBe(true);
    expect(result2.requirements[1]!.isSatisfied).toBe(true); // CHEM 1201 fills bucket
  });

  it("evaluates chooseN requirements partially and fully satisfied", () => {
    const degree = DegreeProgramSchema.parse({
      ...sampleDegree,
      requirements: [
        {
          kind: "chooseN",
          id: "req-choose-2",
          label: "Choose 2",
          semester: 1,
          n: 2,
          options: [{ code: "ENGL 1001" }, { code: "ENGL 1005" }, { code: "ENGL 2000" }],
        },
      ],
    });

    // 1 completed out of 2 needed
    const partial = evaluateRequirements(degree, ["ENGL 1001"]);
    expect(partial.requirements[0]).toMatchObject({
      status: "partially_satisfied",
      isSatisfied: false,
      missingCount: 1,
    });

    // 2 completed out of 2 needed
    const full = evaluateRequirements(degree, ["ENGL 1001", "ENGL 2000"]);
    expect(full.requirements[0]).toMatchObject({
      status: "satisfied",
      isSatisfied: true,
      missingCount: 0,
    });
  });

  it("evaluates credit buckets with custom credits and open categories", () => {
    const result = evaluateRequirements(degreeWithOpenBucket(), [
      { code: "BIOL 1001", credits: 3 },
      { code: "CHEM 1201", credits: 3 },
      { code: "SOCL 2000", credits: 3 }, // Fills open bucket
      { code: "EXTRA 9999", credits: 3 }, // Unused
    ]);

    expect(result.requirements[0]!).toMatchObject({
      id: "sci-bucket",
      status: "satisfied",
      isSatisfied: true,
      fulfilledCredits: 6,
    });

    expect(result.requirements[1]!).toMatchObject({
      id: "open-bucket",
      status: "satisfied",
      isSatisfied: true,
      fulfilledCredits: 3,
    });

    expect(result.unusedCompletedCourses).toEqual(["EXTRA 9999"]);
  });

  it("supports Set<CourseCode> as completed parameter", () => {
    const set = new Set(["CSC 1350", "MATH 1550"]);
    const result = evaluateRequirements(sampleDegree, set);

    expect(result.requirements[0]!.isSatisfied).toBe(true);
  });
});

function degreeWithOpenBucket() {
  return DegreeProgramSchema.parse({
    id: "bucket-degree",
    program: "Test Program",
    concentration: "General",
    catalogYear: "2026-2027",
    totalCredits: 120,
    source: "https://example.com",
    requirements: [
      {
        kind: "creditBucket",
        id: "sci-bucket",
        label: "Science Bucket",
        semester: 1,
        credits: 6,
        category: "Sciences",
        eligibleCourses: [{ code: "BIOL 1001" }, { code: "CHEM 1201" }],
      },
      {
        kind: "creditBucket",
        id: "open-bucket",
        label: "Free Elective",
        semester: 2,
        credits: 3,
        category: "Elective",
        eligibleCourses: [],
      },
    ],
  });
}
