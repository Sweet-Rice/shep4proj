import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import {
  courseDetailUrl,
  createCatalogFetcher,
  parseCourseDetail,
  parseCourseList,
  suggestPrereqTags,
  type CatalogFetcher,
} from "../dist/index.js";

const FIXTURE_DIR = fileURLToPath(new URL("../../../fixtures/catalog/2026-2027/", import.meta.url));

const DEFAULT_OUT_PATH = fileURLToPath(
  new URL("../../../fixtures/prereqs/corpus.json", import.meta.url),
);

const SAVED_FIXTURES: Record<string, string> = {
  "229578": "course-csc-1350.html",
  "229586": "course-csc-2700.html",
  "229589": "course-csc-3102.html",
  "233370": "course-csc-3200.html",
  "232623": "course-csc-4330.html",
};

interface CorpusEntry {
  code: string;
  coid: string;
  text: string;
  courseCodes: string[];
  tags: string[];
}

async function main(): Promise<void> {
  const args = process.argv.slice(2).filter((arg) => arg !== "--");
  const { values } = parseArgs({
    args,
    options: {
      cache: { type: "string" },
      out: { type: "string" },
    },
  });

  if (!values.cache) {
    console.error("Usage: capture-prereq-corpus --cache <dir> [--out <file>]");
    process.exitCode = 1;
    return;
  }

  const cacheDir = resolve(process.cwd(), values.cache);
  const outPath = values.out ? resolve(process.cwd(), values.out) : DEFAULT_OUT_PATH;

  mkdirSync(cacheDir, { recursive: true });

  // Step 1: Read and parse course list fixture
  const listFixturePath = join(FIXTURE_DIR, "csc-course-list.html");
  const listHtml = readFileSync(listFixturePath, "utf8");
  const courseList = parseCourseList(listHtml);

  if (courseList.length !== 91) {
    throw new Error(`expected 91 courses in course list fixture, found ${courseList.length}`);
  }

  // Step 2 & 3: Read/fetch each course detail and parse
  let fetcher: CatalogFetcher | null = null;
  let lastFetchIso: string | null = null;

  const coursesWithoutPrereq: string[] = [];
  const entries: CorpusEntry[] = [];

  try {
    for (const course of courseList) {
      let html: string;
      const fixtureName = SAVED_FIXTURES[course.coid];

      if (fixtureName !== undefined) {
        html = readFileSync(join(FIXTURE_DIR, fixtureName), "utf8");
      } else {
        const cacheFile = join(cacheDir, `${course.coid}.html`);
        if (existsSync(cacheFile)) {
          html = readFileSync(cacheFile, "utf8");
        } else {
          if (fetcher === null) {
            fetcher = createCatalogFetcher({ log: console.log });
          }
          const url = courseDetailUrl({ catoid: "35", coid: course.coid });
          html = await fetcher.fetchHtml(url);
          writeFileSync(cacheFile, html, "utf8");
          lastFetchIso = new Date().toISOString();
        }
      }

      let detail;
      try {
        detail = parseCourseDetail(html);
      } catch (error) {
        console.error(
          `Failed to parse course detail for ${course.code} (coid ${course.coid}):`,
          error,
        );
        throw error;
      }

      if (detail.prerequisiteText === null) {
        coursesWithoutPrereq.push(course.code);
      } else {
        entries.push({
          code: course.code,
          coid: course.coid,
          text: detail.prerequisiteText,
          courseCodes: detail.prerequisiteCourseCodes,
          tags: suggestPrereqTags(detail.prerequisiteText),
        });
      }
    }
  } finally {
    if (fetcher !== null) {
      await fetcher.close();
    }
  }

  // Step 4: Sort
  coursesWithoutPrereq.sort((a, b) => a.localeCompare(b));
  entries.sort((a, b) => a.code.localeCompare(b.code));

  // Step 5: Format JSON
  const corpus = {
    catalogYear: "2026-2027",
    catoid: "35",
    generatedBy: "packages/scraper/scripts/capture-prereq-corpus.ts",
    capturedAt: lastFetchIso ?? new Date().toISOString(),
    courseCount: 91,
    coursesWithoutPrereq,
    entries,
  };

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(corpus, null, 2) + "\n", "utf8");
  console.log(
    `Wrote prereq corpus with ${entries.length} prereq entries and ${coursesWithoutPrereq.length} no-prereq courses to ${outPath}`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
