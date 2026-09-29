import { load } from "cheerio";
import { CatalogShapeError } from "./errors.js";
import { CATALOG_ORIGIN } from "./urls.js";

/** One row of the catalog course list page. */
export interface CourseListEntry {
  /** Course code such as `CSC 1350`. */
  code: string;
  title: string;
  /** Credits exactly as the catalog prints them: `4`, `1-3`, `1-12 per sem.`. */
  creditsText: string;
  /** Acalog course id, used to fetch the course detail page. */
  coid: string;
  /** Owning department, from the `<h2>` heading the row is listed under. */
  department: string;
}

/** `CSC 1350 Computer Science I for Majors (4)` -> code, title, credits text. */
const COURSE_ROW_TEXT = /^([A-Z]{2,4} \d{4})\s+(.+?)\s+\(([^)]+)\)$/;

/**
 * Parses the catalog course list page (`content.php` with the course filter)
 * into one entry per course, in page order.
 *
 * Rows are grouped under `<h2>` department headings, so the page is walked in
 * document order: each `<h2>` sets the current department and each course link
 * yields an entry under it. The catalog reuses the `table_default` class for
 * many nested tables, so the walk does not scope by table.
 *
 * Pure and network-free. Throws {@link CatalogShapeError} when the page no
 * longer looks like a course list, rather than returning a partial result.
 */
export function parseCourseList(html: string): CourseListEntry[] {
  const $ = load(html);
  const entries: CourseListEntry[] = [];
  const seenCodes = new Set<string>();
  let department = "";

  $("h2, a[href*='preview_course_nopop.php']").each((_, element) => {
    if (element.tagName === "h2") {
      department = $(element).text().trim();
      return;
    }

    const text = $(element).text().replace(/\s+/g, " ").trim();
    const match = COURSE_ROW_TEXT.exec(text);
    const code = match?.[1];
    const title = match?.[2];
    const creditsText = match?.[3];
    if (code === undefined || title === undefined || creditsText === undefined) {
      throw new CatalogShapeError(
        `course link text does not match "CODE 0000 Title (credits)": "${text}"`,
      );
    }

    const href = $(element).attr("href") ?? "";
    const coid = new URL(href, CATALOG_ORIGIN).searchParams.get("coid");
    if (coid === null || coid === "") {
      throw new CatalogShapeError(`course link for ${code} has no coid in its href`);
    }
    if (department === "") {
      throw new CatalogShapeError(`course ${code} is not listed under a department heading`);
    }
    if (seenCodes.has(code)) {
      throw new CatalogShapeError(`course ${code} is listed more than once`);
    }
    seenCodes.add(code);

    entries.push({ code, title, creditsText, coid, department });
  });

  if (entries.length === 0) {
    throw new CatalogShapeError("no course rows found on the course list page");
  }
  return entries;
}
