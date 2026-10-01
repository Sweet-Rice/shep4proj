import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { parseTranscriptPdf } from "./transcript-parser.js";

const fixtures = new URL("../../../fixtures/transcripts/", import.meta.url);

describe("parseTranscriptPdf", () => {
  it.each(["academic-record-printable.redacted.pdf", "unofficial-transcript.redacted.pdf"])(
    "parses every course in %s",
    async (name) => {
      const result = await parseTranscriptPdf(await readFile(new URL(name, fixtures)));
      expect(result.unrecognizedLines).toEqual([]);
      expect(result.courses).toHaveLength(name.startsWith("academic") ? 31 : 35);
      expect(result.courses.filter((course) => course.term === null)).toHaveLength(8);
      expect(result.courses).toContainEqual({
        code: "CSC 1350",
        term: { season: "Fall", year: 2024 },
        grade: "A-",
      });
      expect(result.courses).toContainEqual({
        code: "CSC 4562",
        term: { season: "Fall", year: 2026 },
        grade: "Withdrawal",
      });
      expect(result.courses).toContainEqual({ code: "MATH 1021", term: null, grade: "Pass" });
    },
  );

  it("does not confuse honors annotations or pending grades with course codes", async () => {
    const result = await parseTranscriptPdf(
      await readFile(new URL("unofficial-transcript.redacted.pdf", fixtures)),
    );
    expect(result.courses).toContainEqual({
      code: "CSC 3501",
      term: { season: "Spring", year: 2026 },
      grade: "A",
    });
    expect(result.courses).toContainEqual({
      code: "EE 2741",
      term: { season: "Fall", year: 2026 },
      grade: "IP",
    });
  });

  it("agrees on every course shown in both report formats", async () => {
    const academic = await parseTranscriptPdf(
      await readFile(new URL("academic-record-printable.redacted.pdf", fixtures)),
    );
    const unofficial = await parseTranscriptPdf(
      await readFile(new URL("unofficial-transcript.redacted.pdf", fixtures)),
    );
    for (const course of academic.courses) {
      expect(unofficial.courses).toContainEqual(course);
    }
  });
});
