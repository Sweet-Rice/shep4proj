import { describe, expect, it } from "vitest";
import {
  describeDesktop,
  DegreeProgressScreen,
  DegreeProgressView,
  MarkPrereqsDialog,
  CourseSearch,
  SemesterBoard,
} from "./index.js";

describe("desktop", () => {
  it("depends on the shared package", () => {
    expect(describeDesktop()).toContain("@jevschedule/shared");
  });

  it("exports degree progress, course search, and semester board components", () => {
    expect(DegreeProgressScreen).toBeDefined();
    expect(DegreeProgressView).toBeDefined();
    expect(MarkPrereqsDialog).toBeDefined();
    expect(CourseSearch).toBeDefined();
    expect(SemesterBoard).toBeDefined();
  });
});
