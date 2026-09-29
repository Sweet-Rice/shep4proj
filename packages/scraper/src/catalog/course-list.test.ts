import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseCourseList } from "./course-list.js";
import { CatalogShapeError } from "./errors.js";
import { CATALOG_2026_2027, courseDetailUrl, courseListUrl } from "./urls.js";

const FIXTURE_DIR = fileURLToPath(
  new URL("../../../../fixtures/catalog/2026-2027/", import.meta.url),
);
const courseListHtml = readFileSync(`${FIXTURE_DIR}csc-course-list.html`, "utf8");
const fixtureReadme = readFileSync(`${FIXTURE_DIR}README.md`, "utf8").replace(/\r\n/g, "\n");

/** Source URL the README records for a fixture file. */
function readmeSourceUrl(file: string): string {
  const row = new RegExp(`^\\| \`${file}\` \\| \`([^\`]+)\` \\|`, "m").exec(fixtureReadme);
  const url = row?.[1];
  if (url === undefined) {
    throw new Error(`fixture README has no source URL row for ${file}`);
  }
  return url;
}

function pageWithRows(...rows: string[]): string {
  return `<html><body><h2>Computer Science</h2><table>${rows
    .map((row) => `<tr><td class="width">${row}</td></tr>`)
    .join("")}</table></body></html>`;
}

describe("parseCourseList", () => {
  const entries = parseCourseList(courseListHtml);

  it("returns all 91 courses on the CSC list page", () => {
    expect(entries).toHaveLength(91);
  });

  it("groups 90 courses under Computer Science and CSC 3605 under Biological Sciences", () => {
    const inDepartment = (department: string) =>
      entries.filter((entry) => entry.department === department);
    expect(inDepartment("Computer Science")).toHaveLength(90);
    expect(inDepartment("Biological Sciences").map((entry) => entry.code)).toEqual(["CSC 3605"]);
  });

  it("extracts code, title, credits text and coid for CSC 1350", () => {
    expect(entries.find((entry) => entry.code === "CSC 1350")).toEqual({
      code: "CSC 1350",
      title: "Computer Science I for Majors",
      creditsText: "4",
      coid: "229578",
      department: "Computer Science",
    });
  });

  it("keeps free-text credits such as '1-12 per sem.' verbatim", () => {
    expect(entries.find((entry) => entry.code === "CSC 9000")?.creditsText).toBe("1-12 per sem.");
  });

  it("returns unique CSC course codes", () => {
    const codes = entries.map((entry) => entry.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const code of codes) {
      expect(code).toMatch(/^CSC \d{4}$/);
    }
  });

  it("matches the recorded snapshot of every course", () => {
    expect(entries).toMatchSnapshot();
  });

  it("throws CatalogShapeError when the page has no course rows", () => {
    expect(() => parseCourseList("<html></html>")).toThrow(CatalogShapeError);
  });

  it("throws CatalogShapeError naming a course link whose text is malformed", () => {
    const html = pageWithRows(
      '<a href="preview_course_nopop.php?catoid=35&coid=1">Not a course row</a>',
    );
    expect(() => parseCourseList(html)).toThrow(CatalogShapeError);
    expect(() => parseCourseList(html)).toThrow(/Not a course row/);
  });

  it("throws CatalogShapeError when a course link has no coid", () => {
    const html = pageWithRows(
      '<a href="preview_course_nopop.php?catoid=35">CSC 1350 Computer Science I for Majors (4)</a>',
    );
    expect(() => parseCourseList(html)).toThrow(CatalogShapeError);
    expect(() => parseCourseList(html)).toThrow(/CSC 1350.*coid/);
  });

  it("throws CatalogShapeError when a course code is listed twice", () => {
    const row = '<a href="preview_course_nopop.php?catoid=35&coid=1">CSC 1350 Some Title (4)</a>';
    expect(() => parseCourseList(pageWithRows(row, row))).toThrow(CatalogShapeError);
    expect(() => parseCourseList(pageWithRows(row, row))).toThrow(/CSC 1350.*more than once/);
  });

  it("throws CatalogShapeError when a course row precedes any department heading", () => {
    const html =
      '<html><body><a href="preview_course_nopop.php?catoid=35&coid=1">CSC 1350 Some Title (4)</a></body></html>';
    expect(() => parseCourseList(html)).toThrow(CatalogShapeError);
    expect(() => parseCourseList(html)).toThrow(/CSC 1350.*department/);
  });
});

describe("catalog URLs", () => {
  it("builds the CSC course list URL exactly as recorded in the fixture README", () => {
    expect(
      courseListUrl({
        catoid: CATALOG_2026_2027.catoid,
        navoid: CATALOG_2026_2027.navoid,
        prefix: "CSC",
        page: 1,
      }),
    ).toBe(readmeSourceUrl("csc-course-list.html"));
  });

  it("builds the CSC 1350 detail URL exactly as recorded in the fixture README", () => {
    expect(courseDetailUrl({ catoid: "35", coid: "229578" })).toBe(
      readmeSourceUrl("course-csc-1350.html"),
    );
  });
});
