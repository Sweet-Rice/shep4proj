// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { Section } from "@jevschedule/shared";
import { findScheduleConflicts, getSectionKey, useScheduleBuilder } from "./useScheduleBuilder.js";

const sectionA: Section = {
  term: "LSUAM_FALL_2026",
  courseCode: "CSC 1350",
  sectionNumber: "001",
  sectionType: "LEC",
  credits: { min: 3, max: 3, note: null },
  instructor: "Dr. Duncan",
  location: "Coates 0214",
  deliveryMode: "In Person",
  enrollment: 45,
  capacity: 50,
  meetings: [{ days: ["Mon", "Wed"], startMinute: 540, endMinute: 600 }], // 9:00 - 10:00 AM
};

const sectionB: Section = {
  term: "LSUAM_FALL_2026",
  courseCode: "MATH 1550",
  sectionNumber: "001",
  sectionType: "LEC",
  credits: { min: 5, max: 5, note: null },
  instructor: "Dr. Smith",
  location: "Lockett 0101",
  deliveryMode: "In Person",
  enrollment: 40,
  capacity: 40,
  meetings: [{ days: ["Mon", "Wed"], startMinute: 570, endMinute: 630 }], // 9:30 - 10:30 AM (overlaps with sectionA!)
};

const sectionC: Section = {
  term: "LSUAM_FALL_2026",
  courseCode: "ENGL 1001",
  sectionNumber: "001",
  sectionType: "LEC",
  credits: { min: 3, max: 3, note: null },
  instructor: "Prof. Davis",
  location: "Allen 0112",
  deliveryMode: "In Person",
  enrollment: 20,
  capacity: 25,
  meetings: [{ days: ["Tue", "Thu"], startMinute: 810, endMinute: 870 }], // 1:30 - 2:30 PM (no overlap)
};

describe("useScheduleBuilder & findScheduleConflicts", () => {
  it("detects time conflicts between overlapping sections", () => {
    const conflicts = findScheduleConflicts([sectionA, sectionB, sectionC]);

    expect(conflicts.has(getSectionKey(sectionA))).toBe(true);
    expect(conflicts.has(getSectionKey(sectionB))).toBe(true);
    expect(conflicts.has(getSectionKey(sectionC))).toBe(false);
  });

  it("adds and removes sections via hook", () => {
    const { result } = renderHook(() => useScheduleBuilder([sectionC]));

    expect(result.current.sections).toHaveLength(1);
    expect(result.current.hasConflicts).toBe(false);

    act(() => {
      result.current.addSection(sectionA);
      result.current.addSection(sectionB);
    });

    expect(result.current.sections).toHaveLength(3);
    expect(result.current.hasConflicts).toBe(true);
    expect(result.current.conflicts.has(getSectionKey(sectionA))).toBe(true);

    act(() => {
      result.current.removeSection(getSectionKey(sectionB));
    });

    expect(result.current.sections).toHaveLength(2);
    expect(result.current.hasConflicts).toBe(false);
  });
});
