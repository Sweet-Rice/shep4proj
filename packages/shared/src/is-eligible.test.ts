import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { toPrereqRecord } from "./prereq-record.js";
import { isEligible, type EligibilityCourse } from "./is-eligible.js";
import type { PrereqNode } from "./prereq.js";

const HISTORY_DIRECTORY = fileURLToPath(new URL("../../../fixtures/histories/", import.meta.url));
const CORPUS_PATH = fileURLToPath(
  new URL("../../../fixtures/prereqs/corpus.json", import.meta.url),
);

const HistorySchema = z.object({
  id: z.string(),
  description: z.string(),
  completed: z.array(
    z.object({ code: z.string(), grade: z.enum(["A", "B", "C", "D"]).optional() }),
  ),
  plannedSameTerm: z.array(z.string()),
  cases: z.array(
    z.object({
      course: z.string(),
      reason: z.string(),
      expected: z.object({
        status: z.enum(["eligible", "ineligible", "needs_review"]),
        missingPrerequisites: z.array(z.string()),
      }),
    }),
  ),
});

const CorpusSchema = z.object({
  coursesWithoutPrereq: z.array(z.string()),
  entries: z.array(z.object({ code: z.string(), text: z.string() })),
});

const historyFiles = readdirSync(HISTORY_DIRECTORY).filter((file) => file.endsWith(".json"));
const histories = historyFiles.map((file) =>
  HistorySchema.parse(JSON.parse(readFileSync(join(HISTORY_DIRECTORY, file), "utf8"))),
);
const corpus = CorpusSchema.parse(JSON.parse(readFileSync(CORPUS_PATH, "utf8")));
const historyCases = histories.flatMap((history) =>
  history.cases.map((testCase) => ({ history, testCase })),
);

const leaf = (code: string, coreq = false, minGrade: "C" | null = null): PrereqNode => ({
  type: "COURSE",
  code,
  coreq,
  minGrade,
});

const course = (tree: PrereqNode | null, needsReview = false): EligibilityCourse => ({
  code: "CSC 3102",
  prereq: { tree, needsReview },
});

describe("isEligible", () => {
  it("accepts a course without prerequisites", () => {
    expect(isEligible(course(null), [], [])).toEqual({
      eligible: true,
      status: "eligible",
      missingPrerequisites: [],
    });
  });

  it("requires every AND child and reports only the missing ones", () => {
    const tree: PrereqNode = {
      type: "AND",
      children: [leaf("CSC 1350"), leaf("MATH 1550")],
    };
    expect(isEligible(course(tree), new Set(["CSC 1350"]), [])).toEqual({
      eligible: false,
      status: "ineligible",
      missingPrerequisites: ["MATH 1550 completed"],
    });
    expect(isEligible(course(tree), ["CSC 1350", "MATH 1550"], []).eligible).toBe(true);
  });

  it("accepts any OR alternative, including an alternative inside an AND", () => {
    const tree: PrereqNode = {
      type: "AND",
      children: [
        leaf("CSC 1350"),
        { type: "OR", children: [leaf("MATH 1550"), leaf("MATH 1551")] },
      ],
    };
    expect(isEligible(course(tree), ["CSC 1350", "MATH 1551"], []).eligible).toBe(true);
    expect(isEligible(course(tree), ["CSC 1350"], [])).toEqual({
      eligible: false,
      status: "ineligible",
      missingPrerequisites: ["One of: MATH 1550 completed; or MATH 1551 completed"],
    });
  });

  it("counts a same-term course only when the leaf allows a corequisite", () => {
    expect(isEligible(course(leaf("CSC 1350", true)), [], ["CSC 1350"]).eligible).toBe(true);
    expect(isEligible(course(leaf("CSC 1350")), [], ["CSC 1350"])).toEqual({
      eligible: false,
      status: "ineligible",
      missingPrerequisites: ["CSC 1350 completed"],
    });
  });

  it("checks recorded minimum grades and does not assume an unknown grade passes", () => {
    const required = course(leaf("CSC 1350", false, "C"));
    expect(isEligible(required, [{ code: "CSC 1350", grade: "B" }], []).eligible).toBe(true);
    expect(isEligible(required, [{ code: "CSC 1350", grade: "D" }], []).eligible).toBe(false);
    expect(
      isEligible(
        required,
        [
          { code: "CSC 1350", grade: "B" },
          { code: "CSC 1350", grade: "D" },
        ],
        [],
      ).eligible,
    ).toBe(true);
    expect(isEligible(required, ["CSC 1350"], []).missingPrerequisites).toEqual([
      "CSC 1350 with a recorded grade of C or better",
    ]);
  });

  it("returns a warning instead of an ineligible verdict for unreviewed text", () => {
    expect(isEligible(course(null, true), [], [])).toEqual({
      eligible: null,
      status: "needs_review",
      missingPrerequisites: [],
      warning: "Prerequisites need manual review; check the catalog before enrolling.",
    });
  });
});

describe("isEligible on hand-checked student histories", () => {
  it("loads exactly five history fixtures", () => {
    expect(historyFiles).toHaveLength(5);
  });

  it.each(historyCases)("$history.id / $testCase.course", ({ history, testCase }) => {
    const entry = corpus.entries.find(({ code }) => code === testCase.course);
    expect(
      entry !== undefined || corpus.coursesWithoutPrereq.includes(testCase.course),
      `Unknown course in history: ${testCase.course}`,
    ).toBe(true);

    const prereq = toPrereqRecord(entry?.text ?? null);
    const result = isEligible(
      { code: testCase.course, prereq: { tree: prereq.tree, needsReview: prereq.needsReview } },
      history.completed,
      history.plannedSameTerm,
    );
    const expectedEligible =
      testCase.expected.status === "eligible"
        ? true
        : testCase.expected.status === "ineligible"
          ? false
          : null;

    expect(result.status).toBe(testCase.expected.status);
    expect(result.missingPrerequisites).toEqual(testCase.expected.missingPrerequisites);
    expect(result.eligible).toBe(expectedEligible);
  });
});
