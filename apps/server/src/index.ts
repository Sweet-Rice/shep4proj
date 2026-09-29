import { greet, PACKAGE_NAME as SHARED_PACKAGE_NAME } from "@jevschedule/shared";
export { CourseSchema, type Course } from "@jevschedule/shared";

/** Package identifier, used to prove cross-package builds work. */
export const PACKAGE_NAME = "@jevschedule/server";

export { buildServer, type HealthResponse, type ServerOptions } from "./app.js";
export { readListenConfig, type ListenConfig } from "./config.js";
export { registerCourseRoutes } from "./routes/courses.js";

export { createDb, type Db } from "./db/client.js";
export { courses, type CourseRow, type NewCourseRow } from "./db/schema.js";
export { upsertCourses } from "./catalog/upsert.js";
export { runCatalogScrape, toCourseRow } from "./catalog/scrape-job.js";
export { FIXTURE_DETAIL_COIDS, createFixtureFetcher } from "./catalog/fixture-fetcher.js";
export { CATALOG_FIXTURE_DIR, seedCatalogFixtures } from "./catalog/seed.js";
export { getTestDatabaseUrl, truncateCourses } from "./test-support/db.js";
/**
 * Confirms the server package can import from @jevschedule/shared. The
 * runnable server is `main.ts` (`pnpm --filter @jevschedule/server start`).
 */
export function describeServer(): string {
  return `${PACKAGE_NAME} depends on ${SHARED_PACKAGE_NAME}: ${greet("server")}`;
}
