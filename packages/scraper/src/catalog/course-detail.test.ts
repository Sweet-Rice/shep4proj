import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseCourseDetail, type CourseDetail } from "./course-detail.js";
import { CatalogShapeError } from "./errors.js";

const FIXTURE_DIR = fileURLToPath(
  new URL("../../../../fixtures/catalog/2026-2027/", import.meta.url),
);

function fixture(number: string): string {
  return readFileSync(`${FIXTURE_DIR}course-csc-${number}.html`, "utf8");
}

/** A minimal detail page: the catalog's flat markup, `body` following the heading rule. */
function page(body: string, heading = "CSC 1000 Sample Course (3)"): string {
  return `<html><body><table><tr><td><p><h1 id='course_preview_title'>${heading}</h1><hr>${body}</p><br><hr><div>Back to Top</div></td></tr></table></body></html>`;
}

describe("parseCourseDetail fixtures", () => {
  it("parses CSC 1350: prerequisite with five linked courses and two notes", () => {
    expect(parseCourseDetail(fixture("1350"))).toEqual<CourseDetail>({
      code: "CSC 1350",
      title: "Computer Science I for Majors",
      creditsText: "4",
      description:
        "Fundamentals of algorithm development, program design and structured programming using an object-oriented language.",
      prerequisiteText:
        "credit or registration in MATH 1022 or MATH 1023 or MATH 1550 or MATH 1551 or MATH 1552.",
      prerequisiteCourseCodes: ["MATH 1022", "MATH 1023", "MATH 1550", "MATH 1551", "MATH 1552"],
      notes: [
        "Credit will not be given for both this course and CSC 1250 or CSC 1253.",
        "3 hrs. lecture; 3 hrs. lab.",
      ],
    });
  });

  it("parses CSC 2700: keeps the credit range and a prerequisite ending in plain text", () => {
    expect(parseCourseDetail(fixture("2700"))).toEqual<CourseDetail>({
      code: "CSC 2700",
      title: "Special Topics in Computer Science",
      creditsText: "1-3",
      description: "Specialized areas of current interest in computer science.",
      prerequisiteText: "CSC 1254 or CSC 1351 or permission of department.",
      prerequisiteCourseCodes: ["CSC 1254", "CSC 1351"],
      notes: [
        "May be taken for a max. of 6 hrs. of credit when topics vary.",
        "Total credit earned in CSC 2700, CSC 3700, and CSC 4700 should not exceed 9 hrs.",
      ],
    });
  });

  it("parses CSC 3102: corequisite wording and a cross-department course code", () => {
    expect(parseCourseDetail(fixture("3102"))).toEqual<CourseDetail>({
      code: "CSC 3102",
      title: "Advanced Data Structures and Algorithm Analysis",
      creditsText: "3",
      description:
        "Description and utilization of formal ADT representations, especially those on lists, sets, and graphs; time and space analysis of recursive and nonrecursive algorithms, including graph and sorting algorithms; algorithm design techniques.",
      prerequisiteText:
        "CSC 1254 or CSC 1351 and credit or concurrent enrollment in CSC 2259 or EE 2741.",
      prerequisiteCourseCodes: ["CSC 1254", "CSC 1351", "CSC 2259", "EE 2741"],
      notes: [],
    });
  });

  it("parses CSC 3200: semicolon-separated prerequisite groups and a restriction note", () => {
    expect(parseCourseDetail(fixture("3200"))).toEqual<CourseDetail>({
      code: "CSC 3200",
      title: "Ethics in Computing",
      creditsText: "1",
      description:
        "Introduction to ethics theory, ethical decision-making as it relates to the computing professional, licensing, intellectual property, conflicts of interest, freedom of information and privacy, security.",
      prerequisiteText: "ENGL 1005 or ENGL 2000 or HNRS 2000; CSC 3102.",
      prerequisiteCourseCodes: ["ENGL 1005", "ENGL 2000", "HNRS 2000", "CSC 3102"],
      notes: ["For majors only."],
    });
  });

  it("parses CSC 4330: comma-separated prerequisites and no notes", () => {
    expect(parseCourseDetail(fixture("4330"))).toEqual<CourseDetail>({
      code: "CSC 4330",
      title: "Software Systems Development",
      creditsText: "3",
      description:
        "Software requirements analysis; design representation, programming methodologies; verification, validation, maintenance and software planning.",
      prerequisiteText: "CSC 3102, CSC 3380.",
      prerequisiteCourseCodes: ["CSC 3102", "CSC 3380"],
      notes: [],
    });
  });
});

describe("parseCourseDetail markup rules", () => {
  it("returns a null prerequisite and no codes when there is no Prereq. label", () => {
    const detail = parseCourseDetail(page("<em></em> Plain description."));
    expect(detail.prerequisiteText).toBeNull();
    expect(detail.prerequisiteCourseCodes).toEqual([]);
    expect(detail.description).toBe("Plain description.");
  });

  it("keeps any other labelled line as one note, label first", () => {
    const detail = parseCourseDetail(
      page("<em>Coreq.:</em> <em>CSC 1350.</em> <em>Lab fee.</em> A description."),
    );
    expect(detail.notes).toEqual(["Coreq.: CSC 1350.", "Lab fee."]);
    expect(detail.prerequisiteText).toBeNull();
  });

  it("collapses whitespace and non-breaking spaces and ignores display:none spans", () => {
    const detail = parseCourseDetail(
      page(
        `<em>Prereq.:</em> <em>MATH&#160;1550\u00a0 or\n  <span style="display: none !important">&#160;</span>MATH 1551.</em> Some&#160; text\n here.`,
      ),
    );
    expect(detail.prerequisiteText).toBe("MATH 1550 or MATH 1551.");
    expect(detail.description).toBe("Some text here.");
  });

  it("takes only linked course codes for prerequisiteCourseCodes", () => {
    const link = (code: string) =>
      `<a href="preview_course_nopop.php?catoid=35&coid=1" aria-label="View course details for ${code}">${code}</a>`;
    const detail = parseCourseDetail(
      page(`<em>Prereq.:</em> <em>${link("CSC 1254")} or permission of department.</em> Text.`),
    );
    expect(detail.prerequisiteCourseCodes).toEqual(["CSC 1254"]);
  });

  it("stops at the first block element after the heading rule", () => {
    const html = `<html><body><h1 id='course_preview_title'>CSC 1000 Sample Course (3)</h1><hr>Kept text. <strong>Kept too.</strong><br>Dropped after the break.<div>Dropped.</div></body></html>`;
    expect(parseCourseDetail(html).description).toBe("Kept text. Kept too.");
  });

  it("stops at a paragraph that has text but not at an empty one", () => {
    const html = `<html><body><h1 id='course_preview_title'>CSC 1000 Sample Course (3)</h1><hr>Kept text. <p> </p>Also kept.<p>Dropped paragraph.</p></body></html>`;
    expect(parseCourseDetail(html).description).toBe("Kept text. Also kept.");
  });
});

describe("parseCourseDetail shape errors", () => {
  it("throws CatalogShapeError when the page has no course heading", () => {
    expect(() => parseCourseDetail("<html><body><h1>Nothing here</h1></body></html>")).toThrow(
      CatalogShapeError,
    );
  });

  it("throws CatalogShapeError naming a heading that is not CODE 0000 Title (credits)", () => {
    expect(() => parseCourseDetail(page("Description.", "Computer Science I"))).toThrow(
      /does not match "CODE 0000 Title \(credits\)": "Computer Science I"/,
    );
  });

  it("throws CatalogShapeError naming the course when the description is empty", () => {
    expect(() => parseCourseDetail(page("<em>Prereq.:</em> <em>CSC 1254.</em>"))).toThrow(
      new CatalogShapeError("CSC 1000: empty description"),
    );
  });

  it("throws CatalogShapeError when a label has no value", () => {
    expect(() => parseCourseDetail(page("<em>Prereq.:</em> Description."))).toThrow(
      new CatalogShapeError('CSC 1000: label "Prereq.:" has no value'),
    );
  });

  it("throws CatalogShapeError when the prerequisite label appears twice", () => {
    expect(() =>
      parseCourseDetail(
        page("<em>Prereq.:</em> <em>CSC 1254.</em> <em>Prereq.:</em> <em>CSC 1351.</em> Text."),
      ),
    ).toThrow(CatalogShapeError);
  });

  it("throws CatalogShapeError when a prerequisite link label is not a course code", () => {
    const html = page(
      `<em>Prereq.:</em> <em><a aria-label="View course details for Calculus">Calculus</a>.</em> Text.`,
    );
    expect(() => parseCourseDetail(html)).toThrow(CatalogShapeError);
  });
});
