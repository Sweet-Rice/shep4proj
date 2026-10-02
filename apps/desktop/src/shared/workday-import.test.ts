import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  parseAcademicRecord,
  type AcademicRecordResult,
  type CompletedCourse,
  type TransferCredit,
} from "@jevschedule/workday/academic-record";
import {
  parseCurrentRegistrations,
  type CurrentCourse,
  type CurrentRegistrationsResult,
} from "@jevschedule/workday/current-registrations";
import { describe, expect, it } from "vitest";
import { mapAcademicRecord, mapCurrentRegistrations, mapTranscript } from "./workday-import.js";

const FIXTURES_DIR = fileURLToPath(new URL("../../../../fixtures/workday/", import.meta.url));

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(`${FIXTURES_DIR}${name}`, "utf8"));
}

const FALL_2026 = { season: "Fall", year: 2026, label: "Fall Semester 2026" } as const;

function recordCourse(
  code: string,
  grade: string | null,
  status: CompletedCourse["status"],
): CompletedCourse {
  const [subject = "", number = ""] = code.split(" ");
  return {
    code,
    subject,
    number,
    title: "Synthetic Course",
    term: FALL_2026,
    grade,
    gradePoints: null,
    creditHours: 3,
    status,
  };
}

function record(courses: CompletedCourse[]): AcademicRecordResult {
  return { courses, transferCredits: [], unrecognizedRows: [] };
}

function registered(
  code: string,
  registrationStatus: string | null,
  term: CurrentCourse["term"] = FALL_2026,
): CurrentCourse {
  const [subject = "", number = ""] = code.split(" ");
  return {
    code,
    subject,
    number,
    title: "Synthetic Course",
    creditHours: 3,
    gradingBasis: "Graded",
    registrationStatus,
    term,
    sections: [],
  };
}

function registrations(enrolled: CurrentCourse[]): CurrentRegistrationsResult {
  return { enrolled, dropped: [], unrecognizedRows: [] };
}

describe("mapAcademicRecord", () => {
  it("maps the synthetic Workday record into store formats", () => {
    const result = mapAcademicRecord(
      parseAcademicRecord(loadFixture("academic-record.synthetic.json")),
    );

    expect(result).toEqual({
      completed: [
        "CSC 1350",
        "CSC 1351",
        "CSC 2259",
        "CSC 4999",
        "ENGL 1000",
        "ENGL 1001",
        "MATH 1431",
        "MATH 1550",
        "MATH 1552",
        "MATH 2065",
      ],
      inProgress: [{ season: "Fall", year: 2026, courses: ["CSC 3102"] }],
      skipped: [{ code: "ENGL 1001", reason: 'grade "Withdrawal" does not earn credit' }],
    });
  });
  it("normalizes suffixed codes before storing and deduplicating", () => {
    const result = mapAcademicRecord(
      record([
        recordCourse("CSC 4103G", "A", "completed"),
        recordCourse("CSC 4103", "A-", "completed"),
      ]),
    );

    expect(result.completed).toEqual(["CSC 4103"]);
    expect(result.skipped).toEqual([]);
  });

  it("excludes failed, withdrawn and audited courses from completed", () => {
    const result = mapAcademicRecord(
      record([
        recordCourse("CSC 1350", "A", "completed"),
        recordCourse("CSC 1351", "F", "failed"),
        recordCourse("CSC 2259", "Withdrawal", "withdrawn"),
        // The parser labels an audit "completed"; it still earns no credit.
        recordCourse("CSC 3102", "Audit", "completed"),
      ]),
    );

    expect(result.completed).toEqual(["CSC 1350"]);
    expect(result.skipped).toEqual([
      { code: "CSC 1351", reason: 'grade "F" does not earn credit' },
      { code: "CSC 2259", reason: 'grade "Withdrawal" does not earn credit' },
      { code: "CSC 3102", reason: 'grade "Audit" does not earn credit' },
    ]);
  });

  it("counts a course failed and later passed as completed", () => {
    const result = mapAcademicRecord(
      record([recordCourse("CSC 1351", "B", "completed"), recordCourse("CSC 1351", "F", "failed")]),
    );

    expect(result.completed).toEqual(["CSC 1351"]);
  });

  it("keeps ungraded courses from the same season of different years in separate terms", () => {
    const result = mapAcademicRecord(
      record([
        {
          ...recordCourse("CSC 2259", null, "in-progress"),
          term: { season: "Fall", year: 2025, label: "Fall Semester 2025" },
        },
        recordCourse("CSC 3102", null, "in-progress"),
      ]),
    );

    expect(result.inProgress).toEqual([
      { season: "Fall", year: 2025, courses: ["CSC 2259"] },
      { season: "Fall", year: 2026, courses: ["CSC 3102"] },
    ]);
  });
  it("treats blank and common in-progress grades as in progress", () => {
    const result = mapAcademicRecord(
      record([
        recordCourse("CSC 3501", "", "in-progress"),
        recordCourse("CSC 3304", " In Progress ", "in-progress"),
        recordCourse("HNRS 2021", "--", "in-progress"),
      ]),
    );

    expect(result.inProgress).toEqual([
      { season: "Fall", year: 2026, courses: ["CSC 3501", "CSC 3304", "HNRS 2021"] },
    ]);
    expect(result.skipped).toEqual([]);
  });

  it("shows trimmed grade values on no-credit transfer skips", () => {
    const transfer = (code: string, grade: string | null): TransferCredit => {
      const [subject = "", number = ""] = code.split(" ");
      return { code, subject, number, title: "", creditHours: 3, grade, source: null };
    };
    const result = mapAcademicRecord({
      courses: [],
      transferCredits: [transfer("CHEM 1201", " F "), transfer("BIOL 1201", " AU ")],
      unrecognizedRows: [],
    });

    expect(result.skipped).toEqual([
      { code: "CHEM 1201", reason: 'grade "F" does not earn credit' },
      { code: "BIOL 1201", reason: 'grade "AU" does not earn credit' },
    ]);
  });

  it("counts transfer credit only when its grade earns credit", () => {
    const transfer = (code: string, grade: string | null): TransferCredit => {
      const [subject = "", number = ""] = code.split(" ");
      return { code, subject, number, title: "", creditHours: 3, grade, source: null };
    };
    const result = mapAcademicRecord({
      courses: [],
      transferCredits: [
        transfer("CSC 4103G", "A"),
        transfer("MATH 1550", "Pass"),
        transfer("CHEM 1201", "F"),
        transfer("BIOL 1201", null),
      ],
      unrecognizedRows: [],
    });

    expect(result.completed).toEqual(["CSC 4103", "MATH 1550"]);
    expect(result.inProgress).toEqual([]);
    expect(result.skipped).toEqual([
      { code: "CHEM 1201", reason: 'grade "F" does not earn credit' },
      { code: "BIOL 1201", reason: "in-progress term unknown" },
    ]);
  });

  it("never copies names, IDs or row text into the result", () => {
    const leaky = {
      ...recordCourse("CSC 9999X", "Withdrawal", "withdrawn"),
      title: "Pat Example 890000001",
      studentName: "Pat Example",
      studentId: "890000001",
    };
    const result = mapAcademicRecord(record([leaky, { ...leaky, code: "CSC 1350", grade: "A" }]));

    expect(JSON.stringify(result)).not.toMatch(/Pat Example|890000001/);
  });
});

describe("mapTranscript", () => {
  it("normalizes suffixed codes from a transcript and excludes non-credit grades", () => {
    const result = mapTranscript({
      courses: [
        { code: "CSC 1350", term: { season: "Fall", year: 2024 }, grade: "A-" },
        { code: "CSC 1350", term: { season: "Fall", year: 2024 }, grade: "A-" },
        { code: "MATH 1021", term: null, grade: "Pass" },
        { code: "CSC 1351", term: { season: "Spring", year: 2025 }, grade: "F" },
        { code: "CSC 4562", term: { season: "Spring", year: 2025 }, grade: "Withdrawal" },
        { code: "CSC 4103G", term: { season: "Fall", year: 2026 }, grade: "A" },
        { code: "CSC 3102", term: { season: "Fall", year: 2026 }, grade: "IP" },
      ],
      unrecognizedLines: [],
    });

    expect(result).toEqual({
      completed: ["CSC 1350", "CSC 4103", "MATH 1021"],
      inProgress: [{ season: "Fall", year: 2026, courses: ["CSC 3102"] }],
      skipped: [
        { code: "CSC 1351", reason: 'grade "F" does not earn credit' },
        { code: "CSC 4562", reason: 'grade "Withdrawal" does not earn credit' },
      ],
    });
  });
  it("strips non-printable grade characters and truncates displayed grades", () => {
    const result = mapTranscript({
      courses: [
        {
          code: "CSC 3501",
          term: { season: "Fall", year: 2026 },
          grade: " W\u0000ABCDEFGHIJKL ",
        },
      ],
      unrecognizedLines: [],
    });

    expect(result.skipped).toEqual([
      { code: "CSC 3501", reason: 'grade "WABCDEFGHIJK" does not earn credit' },
    ]);
  });

  it("matches IP case-insensitively, like the transcript parser", () => {
    const result = mapTranscript({
      courses: [{ code: "CSC 3102", term: { season: "Fall", year: 2026 }, grade: "ip" }],
      unrecognizedLines: [],
    });

    expect(result.inProgress).toEqual([{ season: "Fall", year: 2026, courses: ["CSC 3102"] }]);
  });

  it("matches completed grades case-insensitively, like the transcript parser", () => {
    const result = mapTranscript({
      courses: [
        { code: "CSC 1350", term: { season: "Fall", year: 2024 }, grade: "a-" },
        { code: "MATH 1021", term: null, grade: "pass" },
      ],
      unrecognizedLines: [],
    });

    expect(result.completed).toEqual(["CSC 1350", "MATH 1021"]);
  });

  it("lists a repeated in-progress row once in its term", () => {
    const result = mapTranscript({
      courses: [
        { code: "CSC 3102", term: { season: "Fall", year: 2026 }, grade: "IP" },
        { code: "CSC 3102", term: { season: "Fall", year: 2026 }, grade: "IP" },
      ],
      unrecognizedLines: [],
    });

    expect(result.inProgress).toEqual([{ season: "Fall", year: 2026, courses: ["CSC 3102"] }]);
  });

  it("groups in-progress rows by season and year", () => {
    const result = mapTranscript({
      courses: [
        { code: "CSC 3102", term: { season: "Summer", year: 2026 }, grade: "IP" },
        { code: "CSC 3380", term: { season: "Fall", year: 2026 }, grade: "IP" },
        { code: "CSC 4330", term: { season: "Spring", year: 2027 }, grade: "IP" },
        { code: "CSC 4101", term: { season: "Fall", year: 2026 }, grade: "IP" },
      ],
      unrecognizedLines: [],
    });

    expect(result.inProgress).toEqual([
      { season: "Summer", year: 2026, courses: ["CSC 3102"] },
      { season: "Fall", year: 2026, courses: ["CSC 3380", "CSC 4101"] },
      { season: "Spring", year: 2027, courses: ["CSC 4330"] },
    ]);
  });
});

describe("mapCurrentRegistrations", () => {
  it("keeps the synthetic registrations in progress, without waitlisted or dropped courses", () => {
    const result = mapCurrentRegistrations(
      parseCurrentRegistrations(loadFixture("current-registrations.synthetic.json")),
    );

    expect(result).toEqual({
      completed: [],
      inProgress: [{ season: "Spring", year: 2026, courses: ["CSC 4330", "CSC 4001"] }],
      skipped: [{ code: "MATH 4997", reason: "registration not confirmed" }],
    });
  });

  it("treats a missing status as registered and skips a course with no term", () => {
    const result = mapCurrentRegistrations(
      registrations([registered("CSC 4330", null), registered("CSC 4001", "Registered", null)]),
    );

    expect(result.inProgress).toEqual([{ season: "Fall", year: 2026, courses: ["CSC 4330"] }]);
    expect(result.skipped).toEqual([{ code: "CSC 4001", reason: "in-progress term unknown" }]);
  });

  it("imports suffixed in-progress courses from registrations and transcripts", () => {
    const fromRegistrations = mapCurrentRegistrations(
      registrations([registered("CSC 4103G", "Registered")]),
    );
    const fromTranscript = mapTranscript({
      courses: [{ code: "CSC 4103G", term: { season: "Fall", year: 2026 }, grade: "IP" }],
      unrecognizedLines: [],
    });

    for (const result of [fromRegistrations, fromTranscript]) {
      expect(result.inProgress).toEqual([{ season: "Fall", year: 2026, courses: ["CSC 4103"] }]);
      expect(result.skipped).toEqual([]);
    }
  });

  it("skips enrolled-grid courses whose status is not Registered", () => {
    const result = mapCurrentRegistrations(
      registrations([registered("CSC 4330", "Enrolled"), registered("CSC 4001", "Pending")]),
    );

    expect(result.inProgress).toEqual([]);
    expect(result.skipped).toEqual([
      { code: "CSC 4330", reason: "registration not confirmed" },
      { code: "CSC 4001", reason: "registration not confirmed" },
    ]);
  });
});
