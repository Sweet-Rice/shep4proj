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
  ImportProgressFlow,
  SuggestionView,
  ModelProviderSettingsView,
  HarnessSettingsView,
} from "./index.js";

describe("desktop", () => {
  it("depends on the shared package", () => {
    expect(describeDesktop()).toContain("@jevschedule/shared");
  });

  it("exports degree progress, course search, semester board, import review, suggestion view, and harness settings components", () => {
    expect(DegreeProgressScreen).toBeDefined();
    expect(DegreeProgressView).toBeDefined();
    expect(MarkPrereqsDialog).toBeDefined();
    expect(CourseSearch).toBeDefined();
    expect(SemesterBoard).toBeDefined();
    expect(WeeklyCalendar).toBeDefined();
    expect(ImportReviewScreen).toBeDefined();
    expect(ImportProgressFlow).toBeDefined();
    expect(SuggestionView).toBeDefined();
    expect(ModelProviderSettingsView).toBeDefined();
    expect(HarnessSettingsView).toBeDefined();
  });
});
