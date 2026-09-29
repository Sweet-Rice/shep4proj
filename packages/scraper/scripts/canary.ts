/**
 * Weekly canary check for catalog.lsu.edu changes.
 *
 * Exercises the catalog fetch and parse layer against the live LSU General
 * Catalog: fetches and parses CSC 4330 detail, then fetches and parses CSC list
 * page 1.
 *
 * Runs in GitHub Actions on a weekly schedule.
 */
import {
  CATALOG_2026_2027,
  courseDetailUrl,
  courseListUrl,
  createCatalogFetcher,
  parseCourseDetail,
  parseCourseList,
} from "../dist/index.js";

async function main(): Promise<void> {
  if (process.env.CANARY_FORCE_FAILURE === "true") {
    console.error("Forced failure requested");
    process.exitCode = 1;
    return;
  }

  const fetcher = createCatalogFetcher({
    log: console.log,
    headless: process.env["CATALOG_HEADLESS"] !== "false",
  });

  try {
    const detailUrl = courseDetailUrl({
      catoid: CATALOG_2026_2027.catoid,
      coid: "232623",
    });
    const detailHtml = await fetcher.fetchHtml(detailUrl);
    const detail = parseCourseDetail(detailHtml);

    if (detail.prerequisiteText === null || detail.description.length === 0) {
      throw new Error(
        `CSC 4330 detail assertion failed: prereq=${detail.prerequisiteText}, descriptionLength=${detail.description.length}`,
      );
    }

    const listUrl = courseListUrl({
      ...CATALOG_2026_2027,
      prefix: "CSC",
      page: 1,
    });
    const listHtml = await fetcher.fetchHtml(listUrl);
    const entries = parseCourseList(listHtml);

    if (entries.length < 85 || !entries.some((e) => e.code === "CSC 1350")) {
      throw new Error(
        `Course list assertion failed: count=${entries.length}, hasCSC1350=${entries.some((e) => e.code === "CSC 1350")}`,
      );
    }

    console.log(
      `canary ok: ${entries.length} courses; CSC 4330 prereq: ${detail.prerequisiteText}`,
    );
  } finally {
    await fetcher.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
