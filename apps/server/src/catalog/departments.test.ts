import { describe, expect, it } from "vitest";
import { CATALOG_SCRAPE_DEPARTMENTS } from "./departments.js";
import { DEFAULT_DEGREE_DATA_DIR, loadDegreePrograms } from "../degrees/load.js";

describe("catalog scrape departments", () => {
  it("includes every prefix referenced by degree programs", async () => {
    const programs = await loadDegreePrograms(DEFAULT_DEGREE_DATA_DIR);
    const prefixes = new Set<string>();
    for (const program of programs) {
      for (const match of JSON.stringify(program).matchAll(/[A-Z]{2,4}(?= \d{4})/g)) {
        prefixes.add(match[0]);
      }
    }
    for (const prefix of prefixes) {
      expect(CATALOG_SCRAPE_DEPARTMENTS).toContain(prefix);
    }
  });
});
