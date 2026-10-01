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
  SectionWatchToggle,
  JevProviderService,
  SuggestionView,
  ModelProviderSettingsView,
} from "./index.js";

describe("desktop", () => {
  it("depends on the shared package", () => {
    expect(describeDesktop()).toContain("@jevschedule/shared");
  });

  it("exports degree progress, course search, semester board, import review, section watch, suggestion view, and model provider components", () => {
    expect(DegreeProgressScreen).toBeDefined();
    expect(DegreeProgressView).toBeDefined();
    expect(MarkPrereqsDialog).toBeDefined();
    expect(CourseSearch).toBeDefined();
    expect(SemesterBoard).toBeDefined();
    expect(WeeklyCalendar).toBeDefined();
    expect(ImportReviewScreen).toBeDefined();
    expect(ImportProgressFlow).toBeDefined();
    expect(SectionWatchToggle).toBeDefined();
    expect(JevProviderService).toBeDefined();
    expect(SuggestionView).toBeDefined();
    expect(ModelProviderSettingsView).toBeDefined();
  });
});
