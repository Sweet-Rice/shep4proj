import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseCourseDetail, type CatalogFetcher } from "@jevschedule/scraper";
import type { Db } from "../db/client.js";
import { runCatalogScrape, toCourseRow } from "./scrape-job.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = path.resolve(__dirname, "../../../../fixtures/catalog/2026-2027");

describe("scrape-job unit tests", () => {
  it("toCourseRow for CSC 2700 gives creditsMin 1, creditsMax 3, creditsNote null, dept 'CSC'", () => {
    const html = readFileSync(path.join(FIXTURE_DIR, "course-csc-2700.html"), "utf8");
    const detail = parseCourseDetail(html);
    const entry = {
      code: "CSC 2700",
      title: detail.title,
      creditsText: detail.creditsText,
      coid: "229586",
      department: "Computer Science",
    };

    const row = toCourseRow(entry, detail, "2026-2027");

    expect(row.creditsMin).toBe(1);
    expect(row.creditsMax).toBe(3);
    expect(row.creditsNote).toBeNull();
    expect(row.dept).toBe("CSC");
    expect(row.code).toBe("CSC 2700");
    expect(row.catalogYear).toBe("2026-2027");
    expect(row.coid).toBe("229586");
    expect(row.prereqNeedsReview).toBe(false);
    expect(row.prereqReviewReason).toBeNull();
    expect(row.prereqNotes).toEqual(["permission of department"]);
    expect(row.prereqTree).toEqual({
      type: "OR",
      children: [
        { type: "COURSE", code: "CSC 1254", coreq: false, minGrade: null },
        { type: "COURSE", code: "CSC 1351", coreq: false, minGrade: null },
      ],
    });
  });

  it("Detail/entry code mismatch lands in failed: use a fake fetcher returning the 4330 page for the 1350 URL", async () => {
    const fakeFetcher: CatalogFetcher = {
      async fetchHtml(url: string) {
        if (url.includes("content.php")) {
          return readFileSync(path.join(FIXTURE_DIR, "csc-course-list.html"), "utf8");
        }
        // Return CSC 4330 HTML regardless of requested detail URL
        return readFileSync(path.join(FIXTURE_DIR, "course-csc-4330.html"), "utf8");
      },
      async close() {},
    };

    const result = await runCatalogScrape({
      db: {} as Db,
      fetcher: fakeFetcher,
      catalogYear: "2026-2027",
      catoid: "35",
      navoid: "3486",
      prefix: "CSC",
      codes: ["CSC 1350"],
    });

    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]?.code).toBe("CSC 1350");
    expect(result.failed[0]?.error).toBe("Detail code mismatch: expected CSC 1350, got CSC 4330");
    expect(result.upserted).toBe(0);
    expect(result.listed).toBe(91);
  });
});
