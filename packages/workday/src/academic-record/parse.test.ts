import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseAcademicRecord } from "./parse.ts";
import { WorkdayShapeError } from "./types.ts";

const FIXTURES_DIR = fileURLToPath(new URL("../../../../fixtures/workday/", import.meta.url));

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(`${FIXTURES_DIR}${name}`, "utf8"));
}

describe("parseAcademicRecord", () => {
  it("parses the synthetic fixture into the exact expected courses, transfer credits, and no unrecognized rows", () => {
    const json = loadFixture("academic-record.synthetic.json");
    const result = parseAcademicRecord(json);

    expect(result.unrecognizedRows).toEqual([]);

    expect(result.courses).toEqual([
      {
        code: "MATH 1550",
        subject: "MATH",
        number: "1550",
        title: "Analytic Geometry and Calculus I",
        term: { season: "Fall", year: 2021, label: "Fall Semester 2021" },
        grade: "A",
        gradePoints: 16,
        creditHours: 4,
        status: "completed",
      },
      {
        code: "CSC 4999G",
        subject: "CSC",
        number: "4999G",
        title: "Special Topics in Computer Science",
        term: { season: "Fall", year: 2021, label: "Fall Semester 2021" },
        grade: "F",
        gradePoints: 0,
        creditHours: 3,
        status: "failed",
      },
      {
        code: "CSC 1350",
        subject: "CSC",
        number: "1350",
        title: "Data Structures",
        term: { season: "Fall", year: 2024, label: "Fall Semester 2024" },
        grade: "A",
        gradePoints: 12,
        creditHours: 3,
        status: "completed",
      },
      {
        code: "ENGL 1000",
        subject: "ENGL",
        number: "1000",
        title: "English Composition I",
        term: { season: "Fall", year: 2024, label: "Fall Semester 2024" },
        grade: "B",
        gradePoints: 9,
        creditHours: 3,
        status: "completed",
      },
      {
        code: "CSC 1351",
        subject: "CSC",
        number: "1351",
        title: "Computer Science II for Majors",
        term: { season: "Spring", year: 2025, label: "Spring Semester 2025" },
        grade: "A+",
        gradePoints: 12,
        creditHours: 3,
        status: "completed",
      },
      {
        code: "ENGL 1001",
        subject: "ENGL",
        number: "1001",
        title: "English Composition II",
        term: { season: "Spring", year: 2025, label: "Spring Semester 2025" },
        grade: "Withdrawal",
        gradePoints: null,
        creditHours: 3,
        status: "withdrawn",
      },
      {
        code: "MATH 1552",
        subject: "MATH",
        number: "1552",
        title: "Analytic Geometry and Calculus II",
        term: { season: "Spring", year: 2025, label: "Spring Semester 2025" },
        grade: "C",
        gradePoints: 8,
        creditHours: 4,
        status: "completed",
      },
      {
        code: "CSC 2259",
        subject: "CSC",
        number: "2259",
        title: "Introduction to Data Structures, Algorithms, and Discrete Mathematics I",
        term: { season: "Winter", year: 2025, label: "Wintersession 2025" },
        grade: "P",
        gradePoints: null,
        creditHours: 1,
        status: "completed",
      },
      {
        code: "CSC 3102",
        subject: "CSC",
        number: "3102",
        title: "Advanced Data Structures, Algorithms, and Discrete Mathematics for Cybersecurity",
        term: { season: "Fall", year: 2026, label: "Fall Semester 2026" },
        grade: null,
        gradePoints: null,
        creditHours: 3,
        status: "in-progress",
      },
      {
        code: "MATH 2065",
        subject: "MATH",
        number: "2065",
        title: "Elementary Differential Equations",
        term: { season: "Fall", year: 2026, label: "Fall Semester 2026" },
        grade: "A",
        gradePoints: 12,
        creditHours: 3,
        status: "completed",
      },
    ]);

    expect(result.transferCredits).toEqual([
      {
        code: "ENGL 1001",
        subject: "ENGL",
        number: "1001",
        title: "ENGL COMPOSITION",
        creditHours: 3,
        grade: "Pass",
        source: "Converted Advanced Standing Credit : Evaluated : 1",
      },
      {
        code: "MATH 1431",
        subject: "MATH",
        number: "1431",
        title: "CALCULUS I",
        creditHours: 3,
        grade: "Pass",
        source: "Converted Advanced Standing Credit : Evaluated : 1",
      },
    ]);
  });

  it("never leaks the student name or ID anywhere in the parsed output", () => {
    const json = loadFixture("academic-record.synthetic.json");
    const result = parseAcademicRecord(json);
    const serialized = JSON.stringify(result);

    expect(serialized).not.toContain("Student One");
    expect(serialized).not.toContain("00000001");
  });

  it("ignores maxLengthValueRow / maxWordLengthValueRow duplicates (course counts match the real rows, not doubled)", () => {
    const json = loadFixture("academic-record.synthetic.json");
    const result = parseAcademicRecord(json);

    expect(result.courses).toHaveLength(10);
    expect(result.transferCredits).toHaveLength(2);
  });

  it("throws WorkdayShapeError with a path when the grid shape has changed (rows renamed to data)", () => {
    const json = loadFixture("academic-record.shape-changed.json");

    let caught: unknown;
    try {
      parseAcademicRecord(json);
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(WorkdayShapeError);
    const err = caught as WorkdayShapeError;
    expect(err.path).toContain("rows");
  });

  it("throws WorkdayShapeError when there is no body at all", () => {
    expect(() => parseAcademicRecord({ title: "no body here" })).toThrow(WorkdayShapeError);
  });

  it("throws WorkdayShapeError when body has no grids", () => {
    expect(() => parseAcademicRecord({ body: { widget: "container", children: [] } })).toThrow(
      WorkdayShapeError,
    );
  });

  it("does not error on a structurally valid record with zero course rows", () => {
    const json = {
      body: {
        widget: "container",
        children: [
          {
            widget: "grid",
            label: "Enrollments",
            columns: [
              { columnId: "90.1" },
              { columnId: "90.2", label: "Course" },
              { columnId: "90.5", label: "Grade" },
            ],
            rows: [],
          },
        ],
      },
    };

    const result = parseAcademicRecord(json);
    expect(result.courses).toEqual([]);
    expect(result.unrecognizedRows).toEqual([]);
  });

  it("resolves columns by label when column ids are renumbered by a Workday release", () => {
    const json = {
      body: {
        widget: "panel",
        label: "Coursework",
        title: "Fall Semester 2025",
        children: [
          {
            widget: "grid",
            label: "Enrollments",
            columns: [
              { columnId: "12.1" },
              { columnId: "12.2", label: "Course" },
              { columnId: "12.5", label: "Grade" },
              { columnId: "12.6", label: "Grade Points" },
              { columnId: "12.7", label: "Credit Hours" },
            ],
            rows: [
              {
                rowIndex: 0,
                cellsMap: {
                  "12.1": { instances: [{ text: "descriptor text we never read" }] },
                  "12.2": {
                    instances: [{ text: "PHYS 2001 - General Physics for Technical Majors I" }],
                  },
                  "12.5": { instances: [{ text: "A" }] },
                  "12.6": { value: 12 },
                  "12.7": { value: 3 },
                },
              },
            ],
          },
        ],
      },
    };

    const result = parseAcademicRecord(json);
    expect(result.courses).toEqual([
      {
        code: "PHYS 2001",
        subject: "PHYS",
        number: "2001",
        title: "General Physics for Technical Majors I",
        term: { season: "Fall", year: 2025, label: "Fall Semester 2025" },
        grade: "A",
        gradePoints: 12,
        creditHours: 3,
        status: "completed",
      },
    ]);
  });

  it("falls back to the enclosing panel title for term when the descriptor has no term suffix", () => {
    const json = {
      body: {
        widget: "panel",
        title: "Spring Semester 2026",
        children: [
          {
            widget: "grid",
            label: "Enrollments",
            columns: [{ columnId: "90.2", label: "Course" }],
            rows: [
              {
                rowIndex: 0,
                cellsMap: {
                  "90.2": { instances: [{ text: "CHEM 1201 - General Chemistry I" }] },
                },
              },
            ],
          },
        ],
      },
    };

    const result = parseAcademicRecord(json);
    expect(result.courses[0]?.term).toEqual({
      season: "Spring",
      year: 2026,
      label: "Spring Semester 2026",
    });
  });

  it("records unrecognized rows with a reason instead of throwing, for a row with unparsable course text", () => {
    const json = {
      body: {
        widget: "grid",
        label: "Enrollments",
        columns: [{ columnId: "90.2", label: "Course" }],
        rows: [
          {
            rowIndex: 0,
            cellsMap: {
              "90.2": { instances: [{ text: "this has no dash separator" }] },
            },
          },
          {
            rowIndex: 1,
            cellsMap: {},
          },
        ],
      },
    };

    const result = parseAcademicRecord(json);
    expect(result.courses).toEqual([]);
    expect(result.unrecognizedRows).toEqual([
      { gridLabel: "Enrollments", rowIndex: 0, reason: "unparsable course text" },
      { gridLabel: "Enrollments", rowIndex: 1, reason: "missing course text" },
    ]);
  });

  it("throws WorkdayShapeError when a cell's instances field is the wrong type", () => {
    const json = {
      body: {
        widget: "grid",
        label: "Enrollments",
        columns: [{ columnId: "90.2", label: "Course" }],
        rows: [
          {
            rowIndex: 0,
            cellsMap: {
              "90.2": { instances: "not-an-array" },
            },
          },
        ],
      },
    };

    expect(() => parseAcademicRecord(json)).toThrow(WorkdayShapeError);
  });
});
