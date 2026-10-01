import { describe, expect, it } from "vitest";
import {
  describeDesktop,
  DegreeProgressScreen,
  DegreeProgressView,
  MarkPrereqsDialog,
  CourseSearch,
  SemesterBoard,
  WeeklyCalendar,
  ImportReviewScreen,
} from "./index.js";

describe("desktop", () => {
  it("depends on the shared package", () => {
    expect(describeDesktop()).toContain("@jevschedule/shared");
  });

  it("exports degree progress, course search, semester board, and import review components", () => {
    expect(DegreeProgressScreen).toBeDefined();
    expect(DegreeProgressView).toBeDefined();
    expect(MarkPrereqsDialog).toBeDefined();
    expect(CourseSearch).toBeDefined();
    expect(SemesterBoard).toBeDefined();
    expect(WeeklyCalendar).toBeDefined();
    expect(ImportReviewScreen).toBeDefined();
  });
});
