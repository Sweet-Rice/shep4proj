import { describe, expect, it } from "vitest";
import { typicalTerms } from "./typical-terms.js";

describe("typicalTerms", () => {
  it("ranks observed seasons by archived terms, keeping their years and section totals", () => {
    expect(
      typicalTerms([
        { term: "LSUAM_FALL_2024", sectionCount: 2 },
        { term: "LSUAM_SPRING_2025", sectionCount: 1 },
        { term: "LSUAM_FALL_2025", sectionCount: 3 },
        { term: "LSUAM_SUMMER_2025", sectionCount: 1 },
        { term: "LSUAM_FALL_2025", sectionCount: 3 },
      ]),
    ).toEqual([
      { season: "Fall", termCount: 2, years: [2024, 2025], sectionCount: 5 },
      { season: "Spring", termCount: 1, years: [2025], sectionCount: 1 },
      { season: "Summer", termCount: 1, years: [2025], sectionCount: 1 },
    ]);
  });

  it("handles online subterms and excludes empty or unrelated periods", () => {
    expect(
      typicalTerms([
        { term: "LSUAM_ONLINE_FALL_1_2026", sectionCount: 1 },
        { term: "LSUAM_FALL_2026", sectionCount: 2 },
        { term: "LSUAM_WINTER_2026", sectionCount: 2 },
        { term: "LSUAM_SPRING_2026", sectionCount: 0 },
      ]),
    ).toEqual([{ season: "Fall", termCount: 2, years: [2026], sectionCount: 3 }]);
    expect(typicalTerms([])).toEqual([]);
  });
});
