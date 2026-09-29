import { describe, expect, it, vi } from "vitest";
import * as parserModule from "./prereq-parser.js";
import { PrereqRecordSchema, toPrereqRecord } from "./prereq-record.js";

describe("toPrereqRecord", () => {
  it("flags garbage input for review with preserved rawText and null tree", () => {
    const raw = "lorem ipsum %%% 42";
    const record = toPrereqRecord(raw);

    expect(record).toEqual({
      rawText: raw,
      tree: null,
      needsReview: true,
      reviewReason: expect.stringMatching(/^unrecognized-token:/),
      notes: [],
    });
    expect(() => PrereqRecordSchema.parse(record)).not.toThrow();
  });

  it("flags ambiguous and/or prereqs (CSC 3102) with reviewReason starting with ambiguous-and-or", () => {
    const raw = "CSC 1254 or CSC 1351 and credit or concurrent enrollment in CSC 2259 or EE 2741.";
    const record = toPrereqRecord(raw);

    expect(record.needsReview).toBe(true);
    expect(record.rawText).toBe(raw);
    expect(record.tree).toBeNull();
    expect(record.reviewReason).toMatch(/^ambiguous-and-or:/);
    expect(record.notes).toEqual([]);
    expect(() => PrereqRecordSchema.parse(record)).not.toThrow();
  });

  it("successfully parses valid prereqs (CSC 4330) preserving rawText with non-null tree", () => {
    const raw = "CSC 3102, CSC 3380.";
    const record = toPrereqRecord(raw);

    expect(record.needsReview).toBe(false);
    expect(record.rawText).toBe(raw);
    expect(record.tree).toEqual({
      type: "AND",
      children: [
        { type: "COURSE", code: "CSC 3102", coreq: false, minGrade: null },
        { type: "COURSE", code: "CSC 3380", coreq: false, minGrade: null },
      ],
    });
    expect(record.reviewReason).toBeNull();
    expect(record.notes).toEqual([]);
    expect(() => PrereqRecordSchema.parse(record)).not.toThrow();
  });

  it("handles null input as no prereqs needed (needsReview false, rawText null, tree null)", () => {
    const record = toPrereqRecord(null);

    expect(record).toEqual({
      rawText: null,
      tree: null,
      needsReview: false,
      reviewReason: null,
      notes: [],
    });
    expect(() => PrereqRecordSchema.parse(record)).not.toThrow();
  });

  it("handles whitespace-only input as no prereqs needed (needsReview false, rawText null, tree null)", () => {
    const record = toPrereqRecord("   \t\n");

    expect(record).toEqual({
      rawText: null,
      tree: null,
      needsReview: false,
      reviewReason: null,
      notes: [],
    });
    expect(() => PrereqRecordSchema.parse(record)).not.toThrow();
  });

  it("validates all outputs against PrereqRecordSchema", () => {
    const samples = [
      null,
      "   ",
      "CSC 4330.",
      "invalid % tokens",
      "CSC 1254 or CSC 1351 and credit in CSC 2259",
    ];

    for (const sample of samples) {
      const record = toPrereqRecord(sample);
      const parsed = PrereqRecordSchema.parse(record);
      expect(parsed).toEqual(record);
    }
  });

  it("handles parser exceptions gracefully with parser-error reviewReason", () => {
    const spy = vi.spyOn(parserModule, "parsePrereqText").mockImplementation(() => {
      throw new Error("unexpected parsing failure");
    });

    try {
      const raw = "CSC 3102.";
      const record = toPrereqRecord(raw);

      expect(record).toEqual({
        rawText: raw,
        tree: null,
        needsReview: true,
        reviewReason: "parser-error: unexpected parsing failure",
        notes: [],
      });
      expect(() => PrereqRecordSchema.parse(record)).not.toThrow();
    } finally {
      spy.mockRestore();
    }
  });
});
