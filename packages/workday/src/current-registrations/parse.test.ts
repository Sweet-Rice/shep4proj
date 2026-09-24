import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseCurrentRegistrations } from "./parse.ts";
import { WorkdayShapeError } from "./types.ts";

const FIXTURES_DIR = fileURLToPath(new URL("../../../../fixtures/workday/", import.meta.url));

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(`${FIXTURES_DIR}${name}`, "utf8"));
}

describe("parseCurrentRegistrations", () => {
  it("parses the synthetic fixture into the exact expected enrolled/dropped courses, with the subtotal skipped", () => {
    const json = loadFixture("current-registrations.synthetic.json");
    const result = parseCurrentRegistrations(json);

    expect(result.unrecognizedRows).toEqual([]);

    expect(result.enrolled).toEqual([
      {
        code: "CSC 4330",
        subject: "CSC",
        number: "4330",
        title: "Software Systems Development",
        creditHours: 3,
        gradingBasis: "Letter Grade",
        registrationStatus: "Registered",
        term: { season: "Spring", year: 2026, label: "Spring Semester 2026" },
        sections: [
          {
            section: "CSC 4330-1",
            instructionalFormat: "Lecture",
            deliveryMode: "Face-to-Face",
            meetingPatterns: ["MWF | 10:30 AM - 11:20 AM | Patrick F Taylor 1200"],
            instructor: "Jane Instructor",
            startDate: "2026-01-12",
            endDate: "2026-05-01",
          },
          {
            section: "CSC 4330-002",
            instructionalFormat: "Laboratory",
            deliveryMode: "Face-to-Face",
            meetingPatterns: ["R | 2:30 PM - 5:20 PM | Patrick F Taylor 1200"],
            instructor: "Jane Instructor",
            startDate: "2026-01-12",
            endDate: "2026-05-01",
          },
        ],
      },
      {
        code: "CSC 4001",
        subject: "CSC",
        number: "4001",
        title: "Operating Systems",
        creditHours: 3,
        gradingBasis: "Letter Grade",
        registrationStatus: "Registered",
        term: { season: "Spring", year: 2026, label: "Spring Semester 2026" },
        sections: [
          {
            section: "CSC 4001-1",
            instructionalFormat: "Lecture",
            deliveryMode: "Face-to-Face",
            meetingPatterns: ["MWF | 1:30 PM - 2:20 PM | Patrick F Taylor 1200"],
            instructor: "John Prof",
            startDate: "2026-01-12",
            endDate: "2026-05-01",
          },
          {
            section: "CSC 4001-2 (Lab)",
            instructionalFormat: "Laboratory",
            deliveryMode: "Face-to-Face",
            meetingPatterns: ["T | 2:00 PM - 4:50 PM | Patrick F Taylor 1220"],
            instructor: "John Prof",
            startDate: "2026-01-12",
            endDate: "2026-05-01",
          },
        ],
      },
      {
        code: "MATH 4997",
        subject: "MATH",
        number: "4997",
        title: "Independent Study",
        creditHours: 1,
        gradingBasis: "Pass/Fail",
        registrationStatus: "Waitlisted",
        term: { season: "Spring", year: 2026, label: "Spring Semester 2026" },
        sections: [
          {
            section: "MATH 4997-1",
            instructionalFormat: "Independent Study",
            deliveryMode: "Online",
            meetingPatterns: ["Independent Study | TBA"],
            instructor: "Ann Prof",
            startDate: "2026-01-12",
            endDate: "2026-05-01",
          },
        ],
      },
    ]);

    expect(result.dropped).toEqual([
      {
        code: "ENGL 2000",
        subject: "ENGL",
        number: "2000",
        title: "Composition II",
        creditHours: 3,
        gradingBasis: "Letter Grade",
        registrationStatus: "Dropped",
        term: { season: "Spring", year: 2026, label: "Spring Semester 2026" },
        sections: [
          {
            section: "ENGL 2000-1",
            instructionalFormat: "Lecture",
            deliveryMode: "Face-to-Face",
            meetingPatterns: ["TR | 9:00 AM - 10:20 AM | Coates Hall 105"],
            instructor: "Sam Faculty",
            startDate: "2026-01-12",
            endDate: "2026-05-01",
          },
          {
            section: "ENGL 2000-2 (Lab)",
            instructionalFormat: "Laboratory",
            deliveryMode: "Face-to-Face",
            meetingPatterns: ["F | 1:00 PM - 2:20 PM | Coates Hall 105"],
            instructor: "Sam Faculty",
            startDate: "2026-01-12",
            endDate: "2026-05-01",
          },
        ],
      },
      {
        code: "HIST 2055",
        subject: "HIST",
        number: "2055",
        title: "Western Civilization",
        creditHours: 3,
        gradingBasis: "Letter Grade",
        registrationStatus: "Dropped",
        term: { season: "Spring", year: 2026, label: "Spring Semester 2026" },
        sections: [
          {
            section: "HIST 2055-1",
            instructionalFormat: "Lecture",
            deliveryMode: "Face-to-Face",
            meetingPatterns: ["MWF | 9:30 AM - 10:20 AM | Coates Hall 201"],
            instructor: "Pat Historian",
            startDate: "2026-01-12",
            endDate: "2026-05-01",
          },
        ],
      },
    ]);
  });

  it("skips the grid-total (subtotal) row without returning or flagging it", () => {
    const json = loadFixture("current-registrations.synthetic.json");
    const result = parseCurrentRegistrations(json);

    // 3 enrolled courses, not 4 (the subtotal row is not a course).
    expect(result.enrolled).toHaveLength(3);
    expect(result.unrecognizedRows).toEqual([]);
  });

  it("ignores maxLengthValueRow / maxWordLengthValueRow duplicates (course counts aren't doubled)", () => {
    const json = loadFixture("current-registrations.synthetic.json");
    const result = parseCurrentRegistrations(json);

    expect(result.enrolled).toHaveLength(3);
    expect(result.dropped).toHaveLength(2);
  });

  it("produces one section entry per instance for a multi-section (lecture + lab) course", () => {
    const json = loadFixture("current-registrations.synthetic.json");
    const result = parseCurrentRegistrations(json);

    const multiSection = result.enrolled.find((c) => c.code === "CSC 4001");
    expect(multiSection?.sections).toHaveLength(2);
    expect(multiSection?.sections.map((s) => s.instructionalFormat)).toEqual([
      "Lecture",
      "Laboratory",
    ]);
  });

  it("appends a rowspan-style continuation row's section to the preceding course instead of flagging it unrecognized", () => {
    const json = loadFixture("current-registrations.synthetic.json");
    const result = parseCurrentRegistrations(json);

    expect(result.unrecognizedRows).toEqual([]);

    const csc4330 = result.enrolled.find((c) => c.code === "CSC 4330");
    expect(csc4330?.sections.map((s) => s.section)).toEqual(["CSC 4330-1", "CSC 4330-002"]);

    const engl2000 = result.dropped.find((c) => c.code === "ENGL 2000");
    expect(engl2000?.sections.map((s) => s.section)).toEqual(["ENGL 2000-1", "ENGL 2000-2 (Lab)"]);
  });

  it("dedupes repeat dropped events of the same section into a single course entry", () => {
    const json = loadFixture("current-registrations.synthetic.json");
    const result = parseCurrentRegistrations(json);

    const hist = result.dropped.filter((c) => c.code === "HIST 2055");
    expect(hist).toHaveLength(1);
    expect(hist[0]?.sections.map((s) => s.section)).toEqual(["HIST 2055-1"]);
  });

  it("keeps two rows with the same course code but different sections as separate courses", () => {
    const json = {
      body: {
        widget: "grid",
        label: "My Enrolled Courses",
        columns: [
          { columnId: "262.2", label: "Course Listing" },
          { columnId: "256.1", label: "Section" },
          { columnId: "256.2", label: "Registration Status" },
        ],
        rows: [
          {
            rowIndex: 0,
            cellsMap: {
              "262.2": { instances: [{ text: "CSC 4700 - Special Topics" }] },
              "256.1": { instances: [{ text: "CSC 4700-001-LEC-FA - Special Topics" }] },
              "256.2": { instances: [{ text: "Registered" }] },
            },
          },
          {
            rowIndex: 1,
            cellsMap: {
              "262.2": { instances: [{ text: "CSC 4700 - Special Topics" }] },
              "256.1": { instances: [{ text: "CSC 4700-004-LEC-FA - Special Topics" }] },
              "256.2": { instances: [{ text: "Registered" }] },
            },
          },
        ],
      },
    };

    const result = parseCurrentRegistrations(json);
    expect(result.enrolled).toHaveLength(2);
    expect(result.enrolled.map((c) => c.sections[0]?.section)).toEqual([
      "CSC 4700-001-LEC-FA",
      "CSC 4700-004-LEC-FA",
    ]);
  });

  it("flags a course-less row as unrecognized when there is no preceding course to attach it to", () => {
    const json = {
      body: {
        widget: "grid",
        label: "My Enrolled Courses",
        columns: [
          { columnId: "262.2", label: "Course Listing" },
          { columnId: "256.1", label: "Section" },
          { columnId: "256.2", label: "Registration Status" },
        ],
        rows: [
          {
            rowIndex: 0,
            cellsMap: {
              "256.1": {
                instances: [{ text: "CSC 4330-002-LAB-FA - Software Systems Development" }],
              },
            },
          },
        ],
      },
    };

    const result = parseCurrentRegistrations(json);
    expect(result.enrolled).toEqual([]);
    expect(result.unrecognizedRows).toEqual([
      { gridLabel: "My Enrolled Courses", rowIndex: 0, reason: "missing course text" },
    ]);
  });

  it("derives the term from the section start date per the documented month mapping", () => {
    const cases: Array<[string, { season: string; year: number }]> = [
      ["01/12/2026", { season: "Spring", year: 2026 }],
      ["05/20/2026", { season: "Summer", year: 2026 }],
      ["08/24/2026", { season: "Fall", year: 2026 }],
      ["12/01/2026", { season: "Winter", year: 2026 }],
    ];

    for (const [startDate, expected] of cases) {
      const json = {
        body: {
          widget: "grid",
          label: "My Enrolled Courses",
          columns: [
            { columnId: "262.2", label: "Course Listing" },
            { columnId: "256.2", label: "Registration Status" },
            { columnId: "256.10", label: "Start Date" },
          ],
          rows: [
            {
              rowIndex: 0,
              cellsMap: {
                "262.2": { instances: [{ text: "CSC 1000 - Intro to Computing" }] },
                "256.2": { instances: [{ text: "Registered" }] },
                "256.10": { instances: [{ text: startDate }] },
              },
            },
          ],
        },
      };

      const result = parseCurrentRegistrations(json);
      expect(result.enrolled[0]?.term).toEqual({
        season: expected.season,
        year: expected.year,
        label:
          expected.season === "Winter"
            ? `Wintersession ${expected.year}`
            : `${expected.season} Semester ${expected.year}`,
      });
    }
  });

  it("returns a null term when the start date's month doesn't map to a known term start", () => {
    const json = {
      body: {
        widget: "grid",
        label: "My Enrolled Courses",
        columns: [
          { columnId: "262.2", label: "Course Listing" },
          { columnId: "256.2", label: "Registration Status" },
          { columnId: "256.10", label: "Start Date" },
        ],
        rows: [
          {
            rowIndex: 0,
            cellsMap: {
              "262.2": { instances: [{ text: "CSC 1000 - Intro to Computing" }] },
              "256.2": { instances: [{ text: "Registered" }] },
              "256.10": { instances: [{ text: "03/01/2026" }] },
            },
          },
        ],
      },
    };

    const result = parseCurrentRegistrations(json);
    expect(result.enrolled[0]?.term).toBeNull();
  });

  it("throws WorkdayShapeError with a path when the grid shape has changed (rows renamed to data)", () => {
    const json = loadFixture("current-registrations.shape-changed.json");

    let caught: unknown;
    try {
      parseCurrentRegistrations(json);
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(WorkdayShapeError);
    const err = caught as WorkdayShapeError;
    expect(err.path).toContain("rows");
  });

  it("throws WorkdayShapeError when there is no body at all", () => {
    expect(() => parseCurrentRegistrations({ title: "no body here" })).toThrow(WorkdayShapeError);
  });

  it("throws WorkdayShapeError when body has no grids at all", () => {
    expect(() =>
      parseCurrentRegistrations({ body: { widget: "container", children: [] } }),
    ).toThrow(WorkdayShapeError);
  });

  it("throws WorkdayShapeError when grids exist but none match the enrolled/dropped rules", () => {
    const json = {
      body: {
        widget: "grid",
        label: "Something Unrelated",
        columns: [{ columnId: "1.1", label: "Unrelated Column" }],
        rows: [],
      },
    };
    expect(() => parseCurrentRegistrations(json)).toThrow(WorkdayShapeError);
  });

  it("identifies the enrolled grid by columns alone when unlabeled", () => {
    const json = {
      body: {
        widget: "grid",
        columns: [
          { columnId: "262.2", label: "Course Listing" },
          { columnId: "256.2", label: "Registration Status" },
        ],
        rows: [
          {
            rowIndex: 0,
            cellsMap: {
              "262.2": { instances: [{ text: "PHYS 2001 - General Physics I" }] },
              "256.2": { instances: [{ text: "Registered" }] },
            },
          },
        ],
      },
    };

    const result = parseCurrentRegistrations(json);
    expect(result.enrolled).toHaveLength(1);
    expect(result.enrolled[0]?.code).toBe("PHYS 2001");
  });

  it("records unrecognized rows with a reason instead of throwing", () => {
    const json = {
      body: {
        widget: "grid",
        label: "My Enrolled Courses",
        columns: [
          { columnId: "262.2", label: "Course Listing" },
          { columnId: "256.2", label: "Registration Status" },
        ],
        rows: [
          {
            rowIndex: 0,
            cellsMap: {
              "262.2": { instances: [{ text: "this has no dash separator" }] },
            },
          },
          {
            rowIndex: 1,
            cellsMap: {},
          },
        ],
      },
    };

    const result = parseCurrentRegistrations(json);
    expect(result.enrolled).toEqual([]);
    expect(result.unrecognizedRows).toEqual([
      { gridLabel: "My Enrolled Courses", rowIndex: 0, reason: "unparsable course text" },
      { gridLabel: "My Enrolled Courses", rowIndex: 1, reason: "missing course text" },
    ]);
  });

  it("never leaks a student name/ID or an instructor email anywhere in the parsed output", () => {
    const json = loadFixture("current-registrations.synthetic.json");
    const result = parseCurrentRegistrations(json);
    const serialized = JSON.stringify(result);

    expect(serialized).not.toContain("Student One");
    expect(serialized).not.toContain("00000001");
    expect(serialized).not.toMatch(/[^\s]+@[^\s]+\.[^\s]+/);
  });
});
