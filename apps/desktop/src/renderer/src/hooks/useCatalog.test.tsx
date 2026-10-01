// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import type { Course, CourseCode, CourseDetail } from "@jevschedule/shared";
import { useCatalogCourses, useCourseDetails } from "./useCatalog.js";

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(window, "jevschedule");
});

const course: Course = {
  catalogYear: "2026-2027",
  code: "CSC 1350",
  title: "Computer Science I",
  credits: { min: 3, max: 3, note: null },
  description: "Introductory course",
  prerequisiteText: null,
};

const detail: CourseDetail = {
  ...course,
  prereq: { tree: null, needsReview: false, reviewReason: null, notes: [] },
};

describe("catalog hooks", () => {
  it("loads the server course list once", async () => {
    const listCourses = vi.fn().mockResolvedValue([course]);
    Object.assign(window, { jevschedule: { catalog: { listCourses } } });
    const { result } = renderHook(() => useCatalogCourses());
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.courses).toEqual([course]));
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(listCourses).toHaveBeenCalledOnce();
  });

  it("reports a catalog load error", async () => {
    Object.assign(window, {
      jevschedule: { catalog: { listCourses: vi.fn().mockRejectedValue(new Error("offline")) } },
    });
    const { result } = renderHook(() => useCatalogCourses());
    await waitFor(() => expect(result.current.error?.message).toBe("offline"));
    expect(result.current.loading).toBe(false);
  });

  it("refetches details when the normalized course codes change", async () => {
    const getCourseDetails = vi.fn(async (codes: CourseCode[]) =>
      codes.includes("CSC 1350") ? { "CSC 1350": detail } : {},
    );
    Object.assign(window, { jevschedule: { catalog: { getCourseDetails } } });
    const { result, rerender } = renderHook(({ codes }) => useCourseDetails(codes), {
      initialProps: { codes: ["CSC 1350", "CSC 1350"] as CourseCode[] },
    });
    await waitFor(() => expect(result.current.details["CSC 1350"]).toEqual(detail));
    expect(getCourseDetails).toHaveBeenCalledWith(["CSC 1350"]);

    rerender({ codes: ["CSC 1351"] });
    await waitFor(() => expect(getCourseDetails).toHaveBeenLastCalledWith(["CSC 1351"]));
    expect(result.current.loading).toBe(false);
  });
});
