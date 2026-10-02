// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import type { Course, CourseCode, CourseDetail, CourseOfferingHistory } from "@jevschedule/shared";
import { useCatalogCourses, useCourseDetails, useCourseHistory } from "./useCatalog.js";

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

  it("refetches details when normalized course codes change and awaits the new result", async () => {
    let resolveNewDetails!: (details: Record<CourseCode, CourseDetail>) => void;
    const newDetails = new Promise<Record<CourseCode, CourseDetail>>((resolve) => {
      resolveNewDetails = resolve;
    });
    const updatedDetail: CourseDetail = {
      ...detail,
      code: "CSC 1351",
      title: "Computer Science II",
    };
    const getCourseDetails = vi.fn((codes: CourseCode[]) =>
      codes.includes("CSC 1350") ? Promise.resolve({ "CSC 1350": detail }) : newDetails,
    );
    Object.assign(window, { jevschedule: { catalog: { getCourseDetails } } });
    const { result, rerender } = renderHook(({ codes }) => useCourseDetails(codes), {
      initialProps: { codes: ["CSC 1350", "CSC 1350"] as CourseCode[] },
    });
    await waitFor(() => {
      expect(result.current.details["CSC 1350"]).toEqual(detail);
      expect(result.current.loading).toBe(false);
    });
    expect(getCourseDetails).toHaveBeenCalledWith(["CSC 1350"]);

    rerender({ codes: ["CSC 1351"] });
    await waitFor(() => expect(getCourseDetails).toHaveBeenLastCalledWith(["CSC 1351"]));
    expect(result.current.loading).toBe(true);

    resolveNewDetails({ "CSC 1351": updatedDetail });
    await waitFor(() => {
      expect(result.current.details["CSC 1351"]).toEqual(updatedDetail);
      expect(result.current.loading).toBe(false);
    });
  });

  it("requests details in chunks within the IPC cap and merges the results", async () => {
    const codes = Array.from({ length: 1200 }, (_, i) => `CSC ${1000 + i}` as CourseCode);
    const getCourseDetails = vi.fn((chunk: CourseCode[]) =>
      Promise.resolve(
        Object.fromEntries(chunk.map((code) => [code, { ...detail, code }])) as Record<
          CourseCode,
          CourseDetail
        >,
      ),
    );
    Object.assign(window, { jevschedule: { catalog: { getCourseDetails } } });
    const { result } = renderHook(() => useCourseDetails(codes));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeNull();
    expect(Object.keys(result.current.details)).toHaveLength(1200);
    expect(getCourseDetails.mock.calls.length).toBeGreaterThan(1);
    for (const [chunk] of getCourseDetails.mock.calls) {
      expect(chunk.length).toBeLessThanOrEqual(500);
    }
  });

  it("fetches and returns history once per distinct planned code", async () => {
    const history: CourseOfferingHistory[] = [{ term: "LSUAM_FALL_2026", sectionCount: 2 }];
    const getCourseHistory = vi.fn().mockResolvedValue(history);
    Object.assign(window, { jevschedule: { catalog: { getCourseHistory } } });
    const { result } = renderHook(() =>
      useCourseHistory(["CSC 1350", "CSC 1350", "CSC 3102"] as CourseCode[]),
    );

    await waitFor(() => {
      expect(result.current.history["CSC 1350"]).toEqual(history);
      expect(result.current.history["CSC 3102"]).toEqual(history);
      expect(result.current.loading).toBe(false);
    });
    expect(getCourseHistory).toHaveBeenCalledTimes(2);
    expect(getCourseHistory).toHaveBeenCalledWith("CSC 1350");
    expect(getCourseHistory).toHaveBeenCalledWith("CSC 3102");
  });
});
