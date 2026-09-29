import { describe, expect, it } from "vitest";
import { CatalogYearSchema } from "./catalog-year.js";
import { CourseCodeSchema } from "./course-code.js";
import { DegreeProgramSchema } from "./requirements.js";

const program = {
  id: "csc-software-engineering-2026-2027",
  program: "Computer Science, B.S.",
  concentration: "Software Engineering",
  catalogYear: "2026-2027",
  totalCredits: 120,
  source: "https://catalog.lsu.edu/preview_program.php?catoid=35&poid=14278",
  requirements: [
    {
      kind: "fixed",
      id: "sem-1-courses",
      label: "Semester 1 courses",
      semester: 1,
      courses: [{ code: "CSC 1350" }, { code: "MATH 1550", minGrade: "C" }],
    },
    {
      kind: "chooseN",
      id: "sem-2-choose-1",
      label: "Composition",
      semester: 2,
      n: 1,
      options: [{ code: "ENGL 1001" }, { code: "ENGL 1005" }],
    },
    {
      kind: "creditBucket",
      id: "sem-2-bucket-1",
      label: "Natural sciences",
      credits: 3,
      category: "General Education course - Natural Sciences",
    },
  ],
};

describe("DegreeProgramSchema", () => {
  it("accepts a program with one requirement of each kind and fills defaults", () => {
    const parsed = DegreeProgramSchema.parse(program);

    expect(parsed.requirements.map((requirement) => requirement.kind)).toEqual([
      "fixed",
      "chooseN",
      "creditBucket",
    ]);

    const [fixed, chooseN, bucket] = parsed.requirements;
    expect(fixed).toMatchObject({
      courses: [
        { code: "CSC 1350", minGrade: null },
        { code: "MATH 1550", minGrade: "C" },
      ],
    });
    expect(chooseN).toMatchObject({
      options: [
        { code: "ENGL 1001", minGrade: null },
        { code: "ENGL 1005", minGrade: null },
      ],
    });
    expect(bucket).toMatchObject({ semester: null, eligibleCourses: [] });
  });

  it("rejects a duplicate requirement id", () => {
    const duplicated = {
      ...program,
      requirements: [...program.requirements, { ...program.requirements[0] }],
    };

    const result = DegreeProgramSchema.safeParse(duplicated);

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.message)).toEqual([
      "duplicate requirement id: sem-1-courses",
    ]);
  });

  it("rejects chooseN where n exceeds the number of options", () => {
    const tooMany = {
      ...program,
      requirements: [{ ...program.requirements[1], n: 3 }],
    };

    const result = DegreeProgramSchema.safeParse(tooMany);

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.message)).toEqual([
      "chooseN sem-2-choose-1: n exceeds options",
    ]);
  });

  it("accepts chooseN where n equals the number of options", () => {
    const all = {
      ...program,
      requirements: [{ ...program.requirements[1], n: 2 }],
    };

    expect(DegreeProgramSchema.safeParse(all).success).toBe(true);
  });

  it("rejects an unknown requirement kind", () => {
    const unknownKind = {
      ...program,
      requirements: [{ ...program.requirements[0], kind: "either" }],
    };

    expect(DegreeProgramSchema.safeParse(unknownKind).success).toBe(false);
  });

  it("rejects a course code without the separating space", () => {
    const badCode = {
      ...program,
      requirements: [{ ...program.requirements[0], courses: [{ code: "CSC4330" }] }],
    };

    expect(DegreeProgramSchema.safeParse(badCode).success).toBe(false);
  });

  it("rejects a program with no requirements", () => {
    expect(DegreeProgramSchema.safeParse({ ...program, requirements: [] }).success).toBe(false);
  });

  it("rejects a semester outside the eight-semester flowchart", () => {
    const lateSemester = {
      ...program,
      requirements: [{ ...program.requirements[0], semester: 9 }],
    };

    expect(DegreeProgramSchema.safeParse(lateSemester).success).toBe(false);
  });
});

describe("CatalogYearSchema", () => {
  it("accepts a two-year span and rejects a single year", () => {
    expect(CatalogYearSchema.safeParse("2026-2027").success).toBe(true);
    expect(CatalogYearSchema.safeParse("2026").success).toBe(false);
  });
});

describe("CourseCodeSchema", () => {
  it("requires uppercase prefix, one space and four digits", () => {
    expect(CourseCodeSchema.safeParse("CSC 4330").success).toBe(true);
    expect(CourseCodeSchema.safeParse("CSC4330").success).toBe(false);
    expect(CourseCodeSchema.safeParse("csc 4330").success).toBe(false);
    expect(CourseCodeSchema.safeParse("CSC 433").success).toBe(false);
  });
});
