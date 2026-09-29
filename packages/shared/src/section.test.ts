import { describe, expect, it } from "vitest";
import {
  AcademicPeriodIdSchema,
  MeetingSchema,
  SectionCourseCodeSchema,
  SectionSchema,
  type Section,
} from "./section.js";

const section: Section = {
  term: "LSUAM_FALL_2026",
  courseCode: "CSC 4330",
  sectionNumber: "001",
  sectionType: "LEC",
  credits: { min: 3, max: 3, note: null },
  instructor: "David C. Shepherd",
  location: "1206 Patrick F. Taylor Hall",
  deliveryMode: "On Campus",
  enrollment: 78,
  capacity: 78,
  meetings: [{ days: ["Tue", "Thu"], startMinute: 900, endMinute: 980 }],
};

describe("SectionCourseCodeSchema", () => {
  it.each(["CSC 4330", "CSC 4330G", "MATH 1550", "EE 2741"])("accepts %s", (code) => {
    expect(SectionCourseCodeSchema.safeParse(code).success).toBe(true);
  });

  it.each(["CSC4330", "csc 4330", "CSC 4330GG", "CSC 433", "CSC 4330 "])("rejects %j", (code) => {
    expect(SectionCourseCodeSchema.safeParse(code).success).toBe(false);
  });
});

describe("AcademicPeriodIdSchema", () => {
  it.each(["LSUAM_FALL_2026", "LSUAM_ONLINE_FALL_1_2026"])("accepts %s", (id) => {
    expect(AcademicPeriodIdSchema.safeParse(id).success).toBe(true);
  });

  it.each(["", "lsuam_fall_2026", "LSUAM__FALL", "_LSUAM", "LSUAM FALL"])("rejects %j", (id) => {
    expect(AcademicPeriodIdSchema.safeParse(id).success).toBe(false);
  });
});

describe("MeetingSchema", () => {
  it("accepts a lab that runs until midnight", () => {
    const lab = { days: ["Thu"], startMinute: 21 * 60, endMinute: 24 * 60 };
    expect(MeetingSchema.parse(lab)).toEqual(lab);
  });

  it.each([
    ["no days", { days: [], startMinute: 900, endMinute: 980 }],
    ["repeated days", { days: ["Tue", "Tue"], startMinute: 900, endMinute: 980 }],
    ["an unknown day", { days: ["Tuesday"], startMinute: 900, endMinute: 980 }],
    ["an end before the start", { days: ["Tue"], startMinute: 980, endMinute: 900 }],
    ["a zero-length meeting", { days: ["Tue"], startMinute: 900, endMinute: 900 }],
    ["a time past midnight", { days: ["Tue"], startMinute: 900, endMinute: 1441 }],
    ["fractional minutes", { days: ["Tue"], startMinute: 900.5, endMinute: 980 }],
  ])("rejects %s", (_label, meeting) => {
    expect(MeetingSchema.safeParse(meeting).success).toBe(false);
  });
});

describe("SectionSchema", () => {
  it("accepts a scheduled lecture", () => {
    expect(SectionSchema.parse(section)).toEqual(section);
  });

  it("accepts a section with no meetings and blank fields", () => {
    const research: Section = {
      ...section,
      courseCode: "CSC 4999G",
      sectionType: "RES",
      credits: { min: 1, max: 12, note: null },
      instructor: null,
      location: null,
      meetings: [],
    };
    expect(SectionSchema.parse(research)).toEqual(research);
  });

  it("accepts over-enrollment", () => {
    expect(SectionSchema.safeParse({ ...section, enrollment: 96, capacity: 95 }).success).toBe(
      true,
    );
  });

  it.each([
    ["a two-digit section number", { sectionNumber: "01" }],
    ["a lowercase section type", { sectionType: "lec" }],
    ["an empty instructor", { instructor: "" }],
    ["negative enrollment", { enrollment: -1 }],
    ["an inverted credit range", { credits: { min: 3, max: 1, note: null } }],
  ])("rejects %s", (_label, patch) => {
    expect(SectionSchema.safeParse({ ...section, ...patch }).success).toBe(false);
  });
});
