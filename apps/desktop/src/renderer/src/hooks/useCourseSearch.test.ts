// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { Course } from "@jevschedule/shared";
import { filterCourses, useCourseSearch } from "./useCourseSearch.js";

const TEST_COURSES: [string, string][] = [
  ["CSC 1350", "Computer Science I for Majors"],
  ["CSC 1351", "Computer Science II for Majors"],
  ["CSC 2250", "Discrete Structures"],
  ["CSC 3102", "Advanced Data Structures and Algorithm Analysis"],
  ["MATH 1550", "Differential and Integral Calculus"],
  ["MATH 1552", "Analytic Geometry and Calculus II"],
  ["ENGL 1001", "English Composition"],
  ["ENGL 2000", "English Composition II"],
  ["BIOL 1001", "General Biology I"],
  ["CHEM 1201", "Basic Chemistry I"],
];
const TEST_CATALOG: Course[] = TEST_COURSES.map(([code, title]) => ({
  catalogYear: "2026-2027",
  code,
  title,
  credits: { min: 3, max: 3, note: null },
  description: title,
  prerequisiteText: null,
}));

describe("useCourseSearch & filterCourses", () => {
  it("returns all test courses when query is empty", () => {
    const matches = filterCourses(TEST_CATALOG, "");
    expect(matches.length).toBe(TEST_CATALOG.length);
  });

  it("filters courses by code matching with or without spaces", () => {
    const matchesSpace = filterCourses(TEST_CATALOG, "CSC 1350");
    expect(matchesSpace).toHaveLength(1);
    expect(matchesSpace[0]?.code).toBe("CSC 1350");

    const matchesNoSpace = filterCourses(TEST_CATALOG, "csc1350");
    expect(matchesNoSpace).toHaveLength(1);
    expect(matchesNoSpace[0]?.code).toBe("CSC 1350");
  });

  it("filters courses case-insensitively by title", () => {
    const matches = filterCourses(TEST_CATALOG, "calculus");
    expect(matches.length).toBeGreaterThanOrEqual(2);
    expect(matches.map((c) => c.code)).toContain("MATH 1550");
    expect(matches.map((c) => c.code)).toContain("MATH 1552");
  });

  it("updates query and results state via hook", () => {
    const { result } = renderHook(() => useCourseSearch(TEST_CATALOG));
    act(() => result.current.setQuery("Discrete"));
    expect(result.current.query).toBe("Discrete");
    expect(result.current.results).toHaveLength(1);
    expect(result.current.results[0]?.code).toBe("CSC 2250");
    act(() => result.current.clearQuery());
    expect(result.current.query).toBe("");
    expect(result.current.results.length).toBe(TEST_CATALOG.length);
  });

  it("reports all matches separately from capped results", () => {
    const catalog = Array.from({ length: 65 }, (_, index) => ({
      ...TEST_CATALOG[0]!,
      code: `TST ${1000 + index}`,
      title: `Test Course ${index}`,
    }));
    const { result } = renderHook(() => useCourseSearch(catalog));
    expect(result.current.results).toHaveLength(50);
    expect(result.current.totalCount).toBe(65);
    expect(result.current.hasMatches).toBe(true);

    act(() => result.current.setQuery("TST"));
    expect(result.current.results).toHaveLength(50);
    expect(result.current.totalCount).toBe(65);
  });

  it("reports true query match count when matches exceed the cap", () => {
    const catalog = Array.from({ length: 65 }, (_, index) => ({
      ...TEST_CATALOG[0]!,
      code: `TST ${1000 + index}`,
      title: `Test Course ${index}`,
    }));
    const { result } = renderHook(() => useCourseSearch(catalog));
    act(() => result.current.setQuery("Test Course"));
    expect(result.current.results).toHaveLength(50);
    expect(result.current.totalCount).toBe(65);
  });
});
