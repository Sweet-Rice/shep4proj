import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { suggestPrereqTags } from "./tags.js";

const CORPUS_PATH = fileURLToPath(
  new URL("../../../../fixtures/prereqs/corpus.json", import.meta.url),
);

const corpusExists = existsSync(CORPUS_PATH);

interface CorpusEntry {
  code: string;
  coid: string;
  text: string;
  courseCodes: string[];
  tags: string[];
}

interface CorpusFile {
  catalogYear: string;
  catoid: string;
  generatedBy: string;
  capturedAt: string;
  courseCount: number;
  coursesWithoutPrereq: string[];
  entries: CorpusEntry[];
}

describe.skipIf(!corpusExists)("prereq corpus fixture", () => {
  const corpus: CorpusFile = corpusExists
    ? (JSON.parse(readFileSync(CORPUS_PATH, "utf8")) as CorpusFile)
    : ({} as CorpusFile);

  it("contains exactly 91 courses across prereq and no-prereq sets", () => {
    expect(corpus.courseCount).toBe(91);
    expect(corpus.entries.length + corpus.coursesWithoutPrereq.length).toBe(91);
    expect(corpus.courseCount).toBe(corpus.entries.length + corpus.coursesWithoutPrereq.length);
  });

  it("contains all unique course codes totaling 91", () => {
    const allCodes = [...corpus.entries.map((entry) => entry.code), ...corpus.coursesWithoutPrereq];
    expect(allCodes).toHaveLength(91);
    const uniqueCodes = new Set(allCodes);
    expect(uniqueCodes.size).toBe(91);
  });

  it("has tags that deep equal suggestPrereqTags for every entry", () => {
    for (const entry of corpus.entries) {
      expect(entry.tags).toEqual(suggestPrereqTags(entry.text));
    }
  });
});
