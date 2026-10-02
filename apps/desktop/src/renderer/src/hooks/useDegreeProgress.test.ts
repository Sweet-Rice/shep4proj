// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import type { DegreeProgram } from "@jevschedule/shared";
import { useDegreeProgress } from "./useDegreeProgress.js";

const sampleDegree: DegreeProgram = {
  id: "csc-se-2026",
  program: "Computer Science, B.S.",
  concentration: "Software Engineering",
  catalogYear: "2026-2027",
  totalCredits: 120,
  source: "https://example.com",
  requirements: [
    {
      kind: "fixed",
      id: "req-1",
      area: "Computer Science",
      label: "Core CSC",
      semester: 1,
      courses: [{ code: "CSC 1350", minGrade: null }],
    },
  ],
};

describe("useDegreeProgress", () => {
  it("returns null when degree is null", () => {
    const { result } = renderHook(() => useDegreeProgress(null, new Set()));
    expect(result.current).toBeNull();
  });

  it("evaluates degree progress accurately when courses are completed", () => {
    const completed = new Set(["CSC 1350"]);
    const { result } = renderHook(() => useDegreeProgress(sampleDegree, completed));

    expect(result.current).not.toBeNull();
    expect(result.current?.degreeId).toBe("csc-se-2026");
    expect(result.current?.isSatisfied).toBe(true);
    expect(result.current?.requirements[0]?.status).toBe("satisfied");
  });

  it("recomputes progress when completed courses set changes", () => {
    let completed = new Set<string>();
    const { result, rerender } = renderHook(({ comp }) => useDegreeProgress(sampleDegree, comp), {
      initialProps: { comp: completed },
    });

    expect(result.current?.isSatisfied).toBe(false);

    completed = new Set(["CSC 1350"]);
    rerender({ comp: completed });

    expect(result.current?.isSatisfied).toBe(true);
  });
});
