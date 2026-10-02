import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CourseKeySchema, CourseSchema, CreditsSchema, parseCreditsText } from "./course.js";

const course = {
  catalogYear: "2026-2027",
  code: "CSC 1253",
  title: "Computer Science I",
  credits: { min: 3, max: 3, note: null },
  description: "Introduction to programming.",
  prerequisiteText: null,
};

describe("parseCreditsText", () => {
  it.each([
    ["(4)", { min: 4, max: 4, note: null }],
    ["(1-3)", { min: 1, max: 3, note: null }],
    ["(1-12)", { min: 1, max: 12, note: null }],
    ["(1-12 per sem.)", { min: 1, max: 12, note: "per sem." }],
    ["1-9", { min: 1, max: 9, note: null }],
  ])("parses %s", (text, expected) => {
    expect(parseCreditsText(text)).toEqual(expected);
  });

  it("throws on text without a leading number", () => {
    expect(() => parseCreditsText("(abc)")).toThrow("unrecognized credits text: (abc)");
  });
});

describe("CourseSchema", () => {
  it("accepts a catalog course without prerequisites", () => {
    expect(CourseSchema.parse(course)).toEqual(course);
  });
  it("accepts an empty catalog description", () => {
    expect(CourseSchema.parse({ ...course, description: "" }).description).toBe("");
  });

  it("keeps original prerequisite wording for later parsing", () => {
    const withPrerequisites = { ...course, prerequisiteText: "MATH 1550 or equivalent" };
    expect(CourseSchema.parse(withPrerequisites).prerequisiteText).toBe("MATH 1550 or equivalent");
  });

  it("parses catalog credit text into a range", () => {
    const parsed = CourseSchema.parse({ ...course, credits: "(1-3)" });
    expect(parsed.credits).toEqual({ min: 1, max: 3, note: null });
  });

  it("rejects an incomplete course", () => {
    expect(CourseSchema.safeParse({ ...course, title: "" }).success).toBe(false);
  });

  it("rejects invalid credits without throwing", () => {
    expect(CourseSchema.safeParse({ ...course, credits: "(abc)" }).success).toBe(false);
    expect(CourseSchema.safeParse({ ...course, credits: 3 }).success).toBe(false);
    expect(
      CourseSchema.safeParse({ ...course, credits: { min: 3, max: 1, note: null } }).success,
    ).toBe(false);
    expect(
      CourseSchema.safeParse({ ...course, credits: { min: -1, max: 3, note: null } }).success,
    ).toBe(false);
    expect(
      CourseSchema.safeParse({ ...course, credits: { min: 1, max: Number.NaN, note: null } })
        .success,
    ).toBe(false);
  });

  it("rejects a malformed catalog year", () => {
    expect(CourseSchema.safeParse({ ...course, catalogYear: "2026" }).success).toBe(false);
  });
});

describe("CourseKeySchema", () => {
  it("keeps only catalogYear and code", () => {
    expect(CourseKeySchema.parse(course)).toEqual({ catalogYear: "2026-2027", code: "CSC 1253" });
  });
});

describe("2026-2027 CSC course list fixture", () => {
  const html = readFileSync(
    fileURLToPath(
      new URL("../../../fixtures/catalog/2026-2027/csc-course-list.html", import.meta.url),
    ),
    "utf8",
  );
  const creditTexts = [
    ...html.matchAll(/<a\b[^>]*preview_course_nopop\.php[^>]*>[^<]*\(([^)]*)\)<\/a>/g),
  ].map((match) => match[1] as string);

  it("lists 91 courses", () => {
    expect(creditTexts).toHaveLength(91);
  });

  it("has credits text that parses and validates for every course", () => {
    for (const text of creditTexts) {
      expect(() => parseCreditsText(text), text).not.toThrow();
      expect(CreditsSchema.safeParse(text).success, text).toBe(true);
    }
  });
});
