import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PrereqNodeSchema } from "./prereq.js";
import { parsePrereqText } from "./prereq-parser.js";

describe("parsePrereqText - Corpus tag examples", () => {
  // tag: 'single' (CSC 4101)
  it("parses a single course code (tag: 'single', CSC 4101)", () => {
    expect(parsePrereqText("CSC 3102.")).toEqual({
      ok: true,
      tree: {
        type: "COURSE",
        code: "CSC 3102",
        coreq: false,
        minGrade: null,
      },
      notes: [],
    });
  });

  // tag: 'and-list' (CSC 4330: must include 4330 -> AND[CSC 3102, CSC 3380])
  it("parses comma-separated AND course list (tag: 'and-list', CSC 4330)", () => {
    expect(parsePrereqText("CSC 3102, CSC 3380.")).toEqual({
      ok: true,
      tree: {
        type: "AND",
        children: [
          { type: "COURSE", code: "CSC 3102", coreq: false, minGrade: null },
          { type: "COURSE", code: "CSC 3380", coreq: false, minGrade: null },
        ],
      },
      notes: [],
    });
  });

  // tag: 'or-list' (CSC 3380)
  it("parses OR course alternatives (tag: 'or-list', CSC 3380)", () => {
    expect(parsePrereqText("CSC 1254 or CSC 1351.")).toEqual({
      ok: true,
      tree: {
        type: "OR",
        children: [
          { type: "COURSE", code: "CSC 1254", coreq: false, minGrade: null },
          { type: "COURSE", code: "CSC 1351", coreq: false, minGrade: null },
        ],
      },
      notes: [],
    });
  });

  // tag: 'semicolon-groups' (CSC 3200: must include 3200 -> AND[OR[ENGL 1005, ENGL 2000, HNRS 2000], CSC 3102])
  it("parses semicolon groups combining clauses (tag: 'semicolon-groups', CSC 3200)", () => {
    expect(parsePrereqText("ENGL 1005 or ENGL 2000 or HNRS 2000; CSC 3102.")).toEqual({
      ok: true,
      tree: {
        type: "AND",
        children: [
          {
            type: "OR",
            children: [
              { type: "COURSE", code: "ENGL 1005", coreq: false, minGrade: null },
              { type: "COURSE", code: "ENGL 2000", coreq: false, minGrade: null },
              { type: "COURSE", code: "HNRS 2000", coreq: false, minGrade: null },
            ],
          },
          { type: "COURSE", code: "CSC 3102", coreq: false, minGrade: null },
        ],
      },
      notes: [],
    });
  });

  // tag: 'mixed-and-or' (CSC 3102: must include 3102 -> ok: false, reason ambiguous-and-or)
  it("flags mixed AND/OR within a clause as ambiguous (tag: 'mixed-and-or', CSC 3102)", () => {
    expect(
      parsePrereqText(
        "CSC 1254 or CSC 1351 and credit or concurrent enrollment in CSC 2259 or EE 2741.",
      ),
    ).toEqual({
      ok: false,
      reason: "ambiguous-and-or",
      detail: "CSC 1254 or CSC 1351 and credit or concurrent enrollment in CSC 2259 or EE 2741",
    });
  });

  // tag: 'coreq' (CSC 1350: must include 1350 -> OR of 5 MATH courses, all coreq: true)
  it("parses leading corequisite phrase applying coreq: true to all courses (tag: 'coreq', CSC 1350)", () => {
    expect(
      parsePrereqText(
        "credit or registration in MATH 1022 or MATH 1023 or MATH 1550 or MATH 1551 or MATH 1552.",
      ),
    ).toEqual({
      ok: true,
      tree: {
        type: "OR",
        children: [
          { type: "COURSE", code: "MATH 1022", coreq: true, minGrade: null },
          { type: "COURSE", code: "MATH 1023", coreq: true, minGrade: null },
          { type: "COURSE", code: "MATH 1550", coreq: true, minGrade: null },
          { type: "COURSE", code: "MATH 1551", coreq: true, minGrade: null },
          { type: "COURSE", code: "MATH 1552", coreq: true, minGrade: null },
        ],
      },
      notes: [],
    });
  });

  // tag: 'non-course' (CSC 2700: must include 2700 -> OR[CSC 1254, CSC 1351] with notes ["permission of department"])
  it("drops non-course phrases into notes (tag: 'non-course', CSC 2700)", () => {
    expect(parsePrereqText("CSC 1254 or CSC 1351 or permission of department.")).toEqual({
      ok: true,
      tree: {
        type: "OR",
        children: [
          { type: "COURSE", code: "CSC 1254", coreq: false, minGrade: null },
          { type: "COURSE", code: "CSC 1351", coreq: false, minGrade: null },
        ],
      },
      notes: ["permission of department"],
    });
  });

  // tag: 'non-csc' (CSC 2533)
  it("parses prerequisite referencing non-CSC department courses (tag: 'non-csc', CSC 2533)", () => {
    expect(parsePrereqText("MATH 1550.")).toEqual({
      ok: true,
      tree: {
        type: "COURSE",
        code: "MATH 1550",
        coreq: false,
        minGrade: null,
      },
      notes: [],
    });
  });
});

describe("parsePrereqText - Minimum grade phrases", () => {
  it("parses min-grade phrase with quotes: '\"C\" or better in CSC 1253'", () => {
    expect(parsePrereqText('"C" or better in CSC 1253')).toEqual({
      ok: true,
      tree: {
        type: "COURSE",
        code: "CSC 1253",
        coreq: false,
        minGrade: "C",
      },
      notes: [],
    });
  });

  it("parses min-grade phrase: 'grade of \"C\" or better in CSC 1253'", () => {
    expect(parsePrereqText('grade of "C" or better in CSC 1253')).toEqual({
      ok: true,
      tree: {
        type: "COURSE",
        code: "CSC 1253",
        coreq: false,
        minGrade: "C",
      },
      notes: [],
    });
  });

  it("parses curly quotes: '“C” or better in CSC 1253'", () => {
    expect(parsePrereqText("“C” or better in CSC 1253")).toEqual({
      ok: true,
      tree: {
        type: "COURSE",
        code: "CSC 1253",
        coreq: false,
        minGrade: "C",
      },
      notes: [],
    });
  });

  it("parses 'grade of “C” in CSC 1253'", () => {
    expect(parsePrereqText("grade of “C” in CSC 1253")).toEqual({
      ok: true,
      tree: {
        type: "COURSE",
        code: "CSC 1253",
        coreq: false,
        minGrade: "C",
      },
      notes: [],
    });
  });

  it("parses multiple courses with distinct min-grades in OR list", () => {
    expect(parsePrereqText('"C" or better in CSC 1253 or "B" or better in CSC 1350')).toEqual({
      ok: true,
      tree: {
        type: "OR",
        children: [
          { type: "COURSE", code: "CSC 1253", coreq: false, minGrade: "C" },
          { type: "COURSE", code: "CSC 1350", coreq: false, minGrade: "B" },
        ],
      },
      notes: [],
    });
  });

  it("parses multiple courses with min-grades in AND list across semicolons", () => {
    expect(parsePrereqText('"C" or better in CSC 1253; "B" or better in MATH 1550')).toEqual({
      ok: true,
      tree: {
        type: "AND",
        children: [
          { type: "COURSE", code: "CSC 1253", coreq: false, minGrade: "C" },
          { type: "COURSE", code: "MATH 1550", coreq: false, minGrade: "B" },
        ],
      },
      notes: [],
    });
  });
});

describe("parsePrereqText - Grammar extensions and edge cases", () => {
  it("parses purely non-course requirement into tree: null and notes (CSC 3999)", () => {
    expect(parsePrereqText("consent of department chair.")).toEqual({
      ok: true,
      tree: null,
      notes: ["consent of department chair"],
    });
  });

  it("parses multiple non-course semicolon clauses into notes (CSC 3991)", () => {
    expect(
      parsePrereqText(
        "CSC 3102; consent of department; admittance to Upper Division Honors Program.",
      ),
    ).toEqual({
      ok: true,
      tree: {
        type: "COURSE",
        code: "CSC 3102",
        coreq: false,
        minGrade: null,
      },
      notes: ["consent of department", "admittance to Upper Division Honors Program"],
    });
  });

  it("parses inline corequisite in an AND list (CSC 4610)", () => {
    expect(parsePrereqText("CSC 2610, CSC 4103, and credit or registration in CSC 4501.")).toEqual({
      ok: true,
      tree: {
        type: "AND",
        children: [
          { type: "COURSE", code: "CSC 2610", coreq: false, minGrade: null },
          { type: "COURSE", code: "CSC 4103", coreq: false, minGrade: null },
          { type: "COURSE", code: "CSC 4501", coreq: true, minGrade: null },
        ],
      },
      notes: [],
    });
  });

  it("parses mixed coreq and credit in an OR list (CSC 1100)", () => {
    expect(parsePrereqText("credit in MATH 1021 or registration in MATH 1023.")).toEqual({
      ok: true,
      tree: {
        type: "OR",
        children: [
          { type: "COURSE", code: "MATH 1021", coreq: false, minGrade: null },
          { type: "COURSE", code: "MATH 1023", coreq: true, minGrade: null },
        ],
      },
      notes: [],
    });
  });

  it("parses placement in course codes in an OR list (CSC 1240)", () => {
    expect(
      parsePrereqText(
        "MATH 1021 or placement in MATH 1022, MATH 1023, MATH 1431, MATH 1550 or MATH 1551.",
      ),
    ).toEqual({
      ok: true,
      tree: {
        type: "OR",
        children: [
          { type: "COURSE", code: "MATH 1021", coreq: false, minGrade: null },
          { type: "COURSE", code: "MATH 1022", coreq: false, minGrade: null },
          { type: "COURSE", code: "MATH 1023", coreq: false, minGrade: null },
          { type: "COURSE", code: "MATH 1431", coreq: false, minGrade: null },
          { type: "COURSE", code: "MATH 1550", coreq: false, minGrade: null },
          { type: "COURSE", code: "MATH 1551", coreq: false, minGrade: null },
        ],
      },
      notes: [],
    });
  });

  it("returns failure with reason 'empty' on empty or whitespace text", () => {
    expect(parsePrereqText("")).toEqual({
      ok: false,
      reason: "empty",
      detail: "prerequisite text is empty",
    });
    expect(parsePrereqText("   ")).toEqual({
      ok: false,
      reason: "empty",
      detail: "prerequisite text is empty",
    });
    expect(parsePrereqText(".")).toEqual({
      ok: false,
      reason: "empty",
      detail: "prerequisite text is empty",
    });
  });

  it("returns failure with reason 'unrecognized-token' on invalid text", () => {
    const res = parsePrereqText("CSC 99999");
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toBe("unrecognized-token");
    }
  });
});

describe("parsePrereqText - Corpus sweep", () => {
  interface CorpusEntry {
    code: string;
    coid: string;
    text: string;
    courseCodes: string[];
    tags: string[];
  }

  interface CorpusData {
    catalogYear: string;
    entries: CorpusEntry[];
  }

  const corpusUrl = new URL("../../../fixtures/prereqs/corpus.json", import.meta.url);
  const corpus = JSON.parse(readFileSync(corpusUrl, "utf-8")) as CorpusData;

  it("parses all 71 corpus entries without throwing, flags mixed-and-or, and achieves >=90% parse rate", () => {
    expect(corpus.entries).toHaveLength(71);
    let cleanCount = 0;

    for (const entry of corpus.entries) {
      let result;
      expect(() => {
        result = parsePrereqText(entry.text);
      }).not.toThrow();

      expect(result).toBeDefined();

      if (entry.tags.includes("mixed-and-or")) {
        expect(result).toEqual({
          ok: false,
          reason: "ambiguous-and-or",
          detail: expect.any(String),
        });
      } else {
        expect(result!.ok).toBe(true);
        if (result!.ok) {
          cleanCount++;
          if (result!.tree !== null) {
            expect(() => PrereqNodeSchema.parse(result!.tree)).not.toThrow();
          }
        }
      }
    }

    const percentage = ((cleanCount / corpus.entries.length) * 100).toFixed(1);
    console.info(`Clean parses: ${cleanCount}/${corpus.entries.length} (${percentage}%)`);

    expect(cleanCount).toBeGreaterThanOrEqual(64);
    expect(cleanCount).toBe(66);
    expect(cleanCount / corpus.entries.length).toBeGreaterThanOrEqual(0.9);
  });
});
