import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { DegreeProgramSchema, type Requirement } from "./requirements.js";

const DEGREES_DIR = fileURLToPath(new URL("../../../data/degrees/", import.meta.url));
const CATALOG_DIR = fileURLToPath(new URL("../../../fixtures/catalog/", import.meta.url));

const SEG_FILE = "csc-software-engineering-2026-2027.yaml";

const degreeFiles = readdirSync(DEGREES_DIR)
  .filter((file) => file.endsWith(".yaml"))
  .sort();

/** Tags become spaces; the entities the catalog uses are decoded; whitespace is collapsed. */
function toText(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&#160;|&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}

/** The HTML from a concentration's `<h3>` heading to the next concentration heading. */
function concentrationSection(programHtml: string, concentration: string): string {
  const headings = [...programHtml.matchAll(/<h3\b[^>]*>([\s\S]*?)<\/h3>/g)];
  const at = headings.findIndex((match) => toText(match[1] ?? "").trim() === concentration);
  const heading = headings[at];
  if (heading === undefined) {
    throw new Error(`no <h3> heading for concentration: ${concentration}`);
  }
  return programHtml.slice(heading.index, headings[at + 1]?.index);
}

interface SemesterBlock {
  text: string;
  totalHours: number;
  /** Credits printed after each course, read from the course links' labels. */
  courseHours: Map<string, number>;
}

/** Each "Semester N" heading through its "Total Semester Hours: N" line. */
function semesterBlocks(sectionHtml: string): Map<number, SemesterBlock> {
  const marks = [...sectionHtml.matchAll(/Semester (\d)<\/h4>/g)];
  const blocks = new Map<number, SemesterBlock>();
  marks.forEach((mark, i) => {
    const html = sectionHtml.slice(mark.index, marks[i + 1]?.index);
    const total = /Total Semester Hours: (\d+)/.exec(html);
    if (total === null) {
      throw new Error(`no "Total Semester Hours" line under semester ${mark[1]}`);
    }
    const listed = html.slice(0, total.index + total[0].length);
    const courseHours = new Map<string, number>();
    for (const label of listed.matchAll(
      /aria-label="View course details for ([A-Z]{2,4} \d{4}) [^"]*?\((\d+(?:\.\d+)?)\)"/g,
    )) {
      courseHours.set(label[1] ?? "", Number(label[2]));
    }
    blocks.set(Number(mark[1]), {
      text: toText(listed),
      totalHours: Number(total[1]),
      courseHours,
    });
  });
  return blocks;
}

function courseRefs(requirement: Requirement) {
  switch (requirement.kind) {
    case "fixed":
      return requirement.courses;
    case "chooseN":
      return requirement.options;
    case "creditBucket":
      return requirement.eligibleCourses;
  }
}

/** Hours a requirement contributes to its semester, taking course credits from the page. */
function requirementHours(requirement: Requirement, block: SemesterBlock): number {
  switch (requirement.kind) {
    case "creditBucket":
      return requirement.credits;
    case "fixed":
      return requirement.courses.reduce((sum, ref) => {
        const hours = block.courseHours.get(ref.code);
        if (hours === undefined) {
          throw new Error(`${requirement.id}: ${ref.code} is not a course of its semester`);
        }
        return sum + hours;
      }, 0);
    case "chooseN":
      throw new Error(`${requirement.id}: chooseN is not supported by the hours check`);
  }
}

describe("data/degrees", () => {
  it("includes the Software Engineering file", () => {
    expect(degreeFiles).toContain(SEG_FILE);
  });

  it.each(degreeFiles)("%s parses and validates against DegreeProgramSchema", (file) => {
    const text = readFileSync(join(DEGREES_DIR, file), "utf-8");
    expect(() => DegreeProgramSchema.parse(parse(text))).not.toThrow();
  });
});

describe(SEG_FILE, () => {
  const degree = DegreeProgramSchema.parse(
    parse(readFileSync(join(DEGREES_DIR, SEG_FILE), "utf-8")),
  );
  const fixtureDir = join(CATALOG_DIR, degree.catalogYear);
  const section = concentrationSection(
    readFileSync(join(fixtureDir, "program-computer-science-bs.html"), "utf-8"),
    degree.concentration,
  );
  const sectionText = toText(section);

  it("reads only its own concentration from the program page", () => {
    expect(section.match(/<h3\b/g)).toHaveLength(1);
    expect(section).toContain("CRITICAL REQUIREMENTS");
    expect(sectionText).toContain("Semester 8");
  });

  it("lists only CSC courses that are in the catalog course list", () => {
    const listHtml = readFileSync(join(fixtureDir, "csc-course-list.html"), "utf-8");
    const anchorPattern =
      /<a\b[^>]*href="preview_course_nopop\.php[^"]*"[^>]*>\s*([A-Z]{2,4} \d{4})\b/g;
    const listed = new Set([...listHtml.matchAll(anchorPattern)].map((match) => match[1]));
    expect(listed.size).toBeGreaterThan(50);

    const cscCodes = degree.requirements
      .flatMap((requirement) => courseRefs(requirement).map((ref) => ref.code))
      .filter((code) => code.startsWith("CSC "));
    expect(cscCodes.length).toBeGreaterThan(0);
    for (const code of cscCodes) {
      expect(listed, code).toContain(code);
    }
  });

  it("names only courses that appear in the Software Engineering section of the program page", () => {
    const codes = degree.requirements
      .filter((requirement) => requirement.kind !== "creditBucket")
      .flatMap((requirement) => courseRefs(requirement).map((ref) => ref.code));
    expect(codes.length).toBeGreaterThan(0);
    for (const code of codes) {
      expect(sectionText, code).toMatch(new RegExp(`(?<![A-Z])${code}(?!\\d)`));
    }
  });

  it("has the total credits the page states", () => {
    expect(sectionText).toContain(`${degree.totalCredits} Total Sem. Hrs.`);
  });

  it("puts every credit bucket on a matching placeholder line in its semester", () => {
    const blocks = semesterBlocks(section);
    let checked = 0;
    for (const requirement of degree.requirements) {
      if (requirement.kind !== "creditBucket") continue;
      const block = blocks.get(requirement.semester ?? 0);
      expect(block, requirement.id).toBeDefined();
      expect(block?.text, requirement.id).toContain(
        `${requirement.category} (${requirement.credits})`,
      );
      checked += 1;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("adds up to the page's hours for every semester and for the whole program", () => {
    const blocks = semesterBlocks(section);
    expect([...blocks.keys()]).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);

    const hoursBySemester = new Map<number, number>();
    for (const requirement of degree.requirements) {
      const block = blocks.get(requirement.semester ?? 0);
      if (requirement.semester === null || block === undefined) {
        throw new Error(`${requirement.id} is not placed in a semester of the page`);
      }
      const hours = requirementHours(requirement, block);
      hoursBySemester.set(
        requirement.semester,
        (hoursBySemester.get(requirement.semester) ?? 0) + hours,
      );
    }

    for (const [semester, block] of blocks) {
      expect(hoursBySemester.get(semester), `semester ${semester}`).toBe(block.totalHours);
    }
    const pageTotal = [...blocks.values()].reduce((sum, block) => sum + block.totalHours, 0);
    expect(pageTotal).toBe(degree.totalCredits);
  });
});
