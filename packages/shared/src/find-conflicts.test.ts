import { describe, expect, it } from "vitest";
import { findConflicts } from "./find-conflicts.js";
import type { Meeting, Section } from "./section.js";

const section = (courseCode: string, meetings: Meeting[], term = "LSUAM_FALL_2026"): Section => ({
  term,
  courseCode,
  sectionNumber: "001",
  sectionType: "LEC",
  credits: { min: 3, max: 3, note: null },
  instructor: null,
  location: null,
  deliveryMode: null,
  enrollment: 0,
  capacity: 30,
  meetings,
});
const meeting = (days: Meeting["days"], startMinute: number, endMinute: number): Meeting => ({
  days,
  startMinute,
  endMinute,
});

describe("findConflicts", () => {
  it("does not flag back-to-back classes or different days and terms", () => {
    const first = section("CSC 1350", [meeting(["Mon"], 540, 600)]);
    const second = section("MATH 1550", [meeting(["Mon"], 600, 660)]);
    const third = section("ENGL 1001", [meeting(["Tue"], 570, 630)]);
    const nextTerm = section("CSC 1351", [meeting(["Mon"], 570, 630)], "LSUAM_SPRING_2027");
    expect(findConflicts([first, second, third, nextTerm])).toEqual([]);
  });

  it("finds overlaps in multiple meetings including labs", () => {
    const first = section("CSC 1350", [
      meeting(["Mon", "Wed"], 540, 600),
      meeting(["Fri"], 780, 900),
    ]);
    const second = section("MATH 1550", [
      meeting(["Mon", "Wed"], 570, 630),
      meeting(["Fri"], 840, 960),
    ]);
    expect(findConflicts([first, second])).toMatchObject([
      { first, second, day: "Mon", startMinute: 570, endMinute: 600 },
      { first, second, day: "Wed", startMinute: 570, endMinute: 600 },
      { first, second, day: "Fri", startMinute: 840, endMinute: 900 },
    ]);
  });

  it("treats TBA meetings as unknown, not a conflict", () => {
    const tba = section("CSC 4999", []);
    const scheduled = section("CSC 1350", [meeting(["Mon"], 540, 600)]);
    expect(findConflicts([tba, scheduled])).toEqual([]);
  });
});
