import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { parseAcademicProgress } from "./parse.ts";
import { WorkdayShapeError } from "./types.ts";

const FIXTURES_DIR = fileURLToPath(new URL("../../../../fixtures/workday/", import.meta.url));

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(`${FIXTURES_DIR}${name}`, "utf8"));
}

describe("parseAcademicProgress", () => {
  it("maps all requirement statuses and parses nested satisfying registrations", () => {
    const result = parseAcademicProgress(loadFixture("academic-progress.synthetic.json"));
    expect(result.overall).toEqual({
      definedCredits: 120,
      inProgressCredits: 12,
      satisfyingCredits: 90,
      remainingCredits: null,
      status: "In Progress",
    });
    expect(result.requirements.map(({ status }) => status)).toEqual([
      "satisfied",
      "in-progress",
      "not-satisfied",
      "satisfied",
      "unknown",
    ]);
    expect(result.requirements[0]).toEqual({
      name: "Core Writing",
      status: "satisfied",
      statusText: "Satisfied",
      remaining: "0",
      satisfiedWith: [{
        code: "CSC 4330",
        text: "CSC 4330G - Advanced Algorithms",
        academicPeriod: "Fall Semester 2026",
        creditHours: 3,
      }],
    });
    expect(result.requirements[1]?.satisfiedWith).toEqual([{
      code: "MATH 1550",
      text: "MATH 1550 - Calculus I",
      academicPeriod: "Spring Semester 2026",
      creditHours: 4,
    }]);
    expect(result.requirements[2]?.satisfiedWith).toEqual([{
      code: "BIO 0000",
      text: "BIO 0000 - Not a catalog course",
      academicPeriod: null,
      creditHours: 0,
    }]);
    expect(result.requirements[4]?.statusText).toBe("Pending Review");
    expect(result.unrecognizedRows).toEqual([]);
    expect(result.requirements[0]).not.toHaveProperty("grade");
  });

  it("does not include student identity values from unrelated cells", () => {
    const serialized = JSON.stringify(parseAcademicProgress(loadFixture("academic-progress.synthetic.json")));
    expect(serialized).not.toContain("Avery Example");
    expect(serialized).not.toContain("123456789");
  });

  it("uses WorkdayShapeError with a path when expected columns are missing", () => {
    const fixture = loadFixture("academic-progress.synthetic.json") as {
      body: { sections: { items: { columns: { columnId: string }[]; rows: { cellsMap: Record<string, unknown> }[] }[] } };
    };
    const requirementsGrid = fixture.body.sections.items[1]!;
    requirementsGrid.columns = requirementsGrid.columns.filter((column) => column.columnId !== "320.2");
    for (const row of requirementsGrid.rows) delete row.cellsMap["320.2"];

    expect(() => parseAcademicProgress(fixture)).toThrowError(WorkdayShapeError);
    try {
      parseAcademicProgress(fixture);
    } catch (error) {
      expect(error).toBeInstanceOf(WorkdayShapeError);
      expect((error as WorkdayShapeError).path).toContain("columns");
    }
  });

  it("rejects a changed response shape with a non-sensitive path", () => {
    expect(() => parseAcademicProgress(loadFixture("academic-progress.shape-changed.json")))
      .toThrowError(WorkdayShapeError);
    try {
      parseAcademicProgress(loadFixture("academic-progress.shape-changed.json"));
    } catch (error) {
      expect(error).toBeInstanceOf(WorkdayShapeError);
      expect((error as WorkdayShapeError).path).toBe("body");
      expect((error as Error).message).not.toContain("Avery");
    }
  });
});
