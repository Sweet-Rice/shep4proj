// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { filterCourses, SAMPLE_CATALOG, useCourseSearch } from "./useCourseSearch.js";

describe("useCourseSearch & filterCourses", () => {
  it("returns all sample courses when query is empty", () => {
    const matches = filterCourses(SAMPLE_CATALOG, "");
    expect(matches.length).toBe(SAMPLE_CATALOG.length);
  });

  it("filters courses by code matching with or without spaces", () => {
    const matchesSpace = filterCourses(SAMPLE_CATALOG, "CSC 1350");
    expect(matchesSpace).toHaveLength(1);
    expect(matchesSpace[0]?.code).toBe("CSC 1350");

    const matchesNoSpace = filterCourses(SAMPLE_CATALOG, "csc1350");
    expect(matchesNoSpace).toHaveLength(1);
    expect(matchesNoSpace[0]?.code).toBe("CSC 1350");
  });

  it("filters courses case-insensitively by title", () => {
    const matches = filterCourses(SAMPLE_CATALOG, "calculus");
    expect(matches.length).toBeGreaterThanOrEqual(2);
    expect(matches.map((c) => c.code)).toContain("MATH 1550");
    expect(matches.map((c) => c.code)).toContain("MATH 1552");
  });

  it("filters courses by department", () => {
    const matches = filterCourses(SAMPLE_CATALOG, "chemistry");
    expect(matches).toHaveLength(1);
    expect(matches[0]?.code).toBe("CHEM 1201");
  });

  it("updates query and results state via hook", () => {
    const { result } = renderHook(() => useCourseSearch(SAMPLE_CATALOG));

    act(() => {
      result.current.setQuery("Discrete");
    });

    expect(result.current.query).toBe("Discrete");
    expect(result.current.results).toHaveLength(1);
    expect(result.current.results[0]?.code).toBe("CSC 2250");

    act(() => {
      result.current.clearQuery();
    });

    expect(result.current.query).toBe("");
    expect(result.current.results.length).toBe(SAMPLE_CATALOG.length);
  });
});
