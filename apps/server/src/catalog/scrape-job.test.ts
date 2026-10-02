import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  COURSE_LIST_PAGE_SIZE,
  parseCourseDetail,
  type CatalogFetcher,
} from "@jevschedule/scraper";
import type { Db } from "../db/client.js";
import { MAX_CATALOG_LIST_PAGES, runCatalogScrape, toCourseRow } from "./scrape-job.js";

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

  it.each([
    [
      "CHEM 1101",
      "course-chem-1101.html",
      "3",
      "Credits not stated in the LSU catalog; assumed 3.",
    ],
    ["EE 7422", "course-ee-7422.html", "3", "Credits not stated in the LSU catalog; assumed 3."],
    ["PHYS 7353", "course-phys-7353.html", "3", null],
    ["BIOL 4801", "course-biol-4801.html", "1-2", null],
  ])("%s converts its captured detail into a schema-valid row", (code, file, creditsText, note) => {
    const detail = parseCourseDetail(readFileSync(path.join(FIXTURE_DIR, file), "utf8"));
    const row = toCourseRow(
      {
        code,
        title: detail.title,
        creditsText: null,
        coid: "test-coid",
        department: code.split(" ")[0]!,
      },
      detail,
      "2026-2027",
    );
    expect(row.creditsMin).toBe(Number(creditsText.split("-")[0]));
    expect(row.creditsMax).toBe(Number(creditsText.split("-").at(-1)));
    expect(row.creditsNote).toBe(note);
    expect(row.description).toBe(detail.description);
  });
  it("converts THTR 7900 with an empty prerequisite label into a course row", () => {
    const detail = parseCourseDetail(
      readFileSync(path.join(FIXTURE_DIR, "course-thtr-7900.html"), "utf8"),
    );
    const row = toCourseRow(
      {
        code: "THTR 7900",
        title: detail.title,
        creditsText: "3",
        coid: "231970",
        department: "Theatre",
      },
      detail,
      "2026-2027",
    );

    expect(row.code).toBe("THTR 7900");
    expect(row.dept).toBe("THTR");
    expect(row.prerequisiteText).toBeNull();
    expect(row.prereqTree).toBeNull();
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
  it("defaults a credit-less course and keeps scraping later courses", async () => {
    const list = `<html><body><h2>Chemistry</h2><a href="preview_course_nopop.php?catoid=35&coid=236828">CHEM 1101 Principles of Chemistry I</a><a href="preview_course_nopop.php?catoid=35&coid=888888">CHEM 1102 Principles of Chemistry II (3)</a></body></html>`;
    const regularDetail =
      '<html><body><h1 id="course_preview_title">CHEM 1102 Principles of Chemistry II (3)</h1><hr>Course description.</body></html>';
    const logs: string[] = [];
    const fetcher: CatalogFetcher = {
      async fetchHtml(url: string) {
        if (url.includes("content.php")) return list;
        if (url.includes("coid=236828")) {
          return readFileSync(path.join(FIXTURE_DIR, "course-chem-1101.html"), "utf8");
        }
        return regularDetail;
      },
      async close() {},
    };
    const inserted: unknown[] = [];
    const db = {
      insert: () => ({
        values: (rows: unknown[]) => {
          inserted.push(...rows);
          return {
            onConflictDoUpdate: () => ({
              returning: async () => rows.map((_, i) => ({ id: String(i) })),
            }),
          };
        },
      }),
    } as unknown as Db;
    const result = await runCatalogScrape({
      db,
      fetcher,
      catalogYear: "2026-2027",
      catoid: "35",
      navoid: "3486",
      prefix: "CHEM",
      log: (message) => logs.push(message),
    });

    expect(result).toEqual({ listed: 2, upserted: 2, skipped: 0, failed: [] });
    expect(inserted).toHaveLength(2);
    expect(logs).toContain("CHEM 1101: credits not stated; assuming 3");
  });

  it("stops after the maximum number of full catalog list pages", async () => {
    const rows = Array.from({ length: COURSE_LIST_PAGE_SIZE }, (_, index) => {
      const code = `CSC ${String(1000 + index).padStart(4, "0")}`;
      const href = `preview_course_nopop.php?coid=${index + 1}`;
      return `<a href="${href}">${code} Course ${index} (3)</a>`;
    });
    const html = `<h2>Computer Science</h2>${rows.join("")}`;
    let listPageRequests = 0;
    const fetcher: CatalogFetcher = {
      async fetchHtml(url) {
        if (!url.includes("content.php")) {
          throw new Error("detail fetch before pagination ends");
        }
        listPageRequests += 1;
        if (listPageRequests > MAX_CATALOG_LIST_PAGES) {
          throw new Error("Unexpected request after the page limit");
        }
        return html;
      },
      async close() {},
    };

    await expect(
      runCatalogScrape({
        db: {} as Db,
        fetcher,
        catalogYear: "2026-2027",
        catoid: "35",
        navoid: "3486",
        prefix: "CSC",
      }),
    ).rejects.toThrow(`Catalog course list exceeded ${MAX_CATALOG_LIST_PAGES} pages`);
    expect(listPageRequests).toBe(MAX_CATALOG_LIST_PAGES);
  });
});
