import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { extractPdfText } from "./transcript-pdf.js";

const fixtures = new URL("../../../fixtures/transcripts/", import.meta.url);

describe("extractPdfText", () => {
  it("extracts all pages of the printable academic record", async () => {
    const bytes = await readFile(new URL("academic-record-printable.redacted.pdf", fixtures));
    const originalLength = bytes.byteLength;
    const result = await extractPdfText(bytes);

    expect(bytes.byteLength).toBe(originalLength);
    expect(result.pages).toHaveLength(9);
    expect(result.pages.map((page) => page.pageNumber)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(result.pages[0]?.text.split("\n")[0]).toMatchInlineSnapshot(
      '"View My Academic Record   06:42 PM"',
    );
    expect(
      result.pages[0]?.text
        .split("\n")
        .find((line) => line.includes("CSC 4562"))
        ?.trimEnd(),
    ).toMatchInlineSnapshot('"CSC 4562 - Mobile Security and Applied"');
    expect(result.text).toContain("Fall Semester 2026");
    expect(result.text).toContain("CSC 1350");
    expect(result.text).toContain("\n\f\n");
  });

  it("extracts all pages of the unofficial transcript", async () => {
    const bytes = await readFile(new URL("unofficial-transcript.redacted.pdf", fixtures));
    const result = await extractPdfText(bytes);

    expect(result.pages).toHaveLength(3);
    expect(result.pages[0]?.text.split("\n")[1]?.trimEnd()).toMatchInlineSnapshot(
      '"Unofficial Transcript"',
    );
    expect(
      result.pages[1]?.text.split("\n").find((line) => line.includes("CSC 1350")),
    ).toMatchInlineSnapshot('"CSC 1350   COMP SCI I-MJRS   4.00   4.00"');
    expect(result.text).toContain("CSC 4562");
  });
});
