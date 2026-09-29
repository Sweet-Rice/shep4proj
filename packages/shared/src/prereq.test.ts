import { describe, expect, it } from "vitest";
import { PrereqNodeSchema } from "./prereq.js";

describe("PrereqNodeSchema", () => {
  it("parses a nested AND/OR tree and returns it unchanged", () => {
    const tree = {
      type: "AND",
      children: [
        {
          type: "OR",
          children: [
            { type: "COURSE", code: "ENGL 1005", coreq: false, minGrade: null },
            { type: "COURSE", code: "ENGL 2000", coreq: false, minGrade: null },
          ],
        },
        { type: "COURSE", code: "CSC 3102", coreq: false, minGrade: "C" },
      ],
    };

    expect(PrereqNodeSchema.parse(tree)).toEqual(tree);
  });

  it("rejects an AND node with a single child", () => {
    const result = PrereqNodeSchema.safeParse({
      type: "AND",
      children: [{ type: "COURSE", code: "CSC 3102", coreq: false, minGrade: null }],
    });

    expect(result.success).toBe(false);
  });

  it("rejects a COURSE node with minGrade F", () => {
    const result = PrereqNodeSchema.safeParse({
      type: "COURSE",
      code: "CSC 3102",
      coreq: false,
      minGrade: "F",
    });

    expect(result.success).toBe(false);
  });

  it("rejects an unknown node type", () => {
    const result = PrereqNodeSchema.safeParse({
      type: "NOT",
      children: [{ type: "COURSE", code: "CSC 3102", coreq: false, minGrade: null }],
    });

    expect(result.success).toBe(false);
  });
});
