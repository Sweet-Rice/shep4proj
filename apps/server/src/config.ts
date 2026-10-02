import { DEPARTMENT_PATTERN } from "./sections/store.js";

/** Where the server listens. */
export interface ListenConfig {
  host: string;
  port: number;
}

export const DEFAULT_HOST = "127.0.0.1";
export const DEFAULT_PORT = 3000;

/**
 * Reads `HOST` and `PORT` from the environment. Defaults to localhost so a dev
 * server isn't reachable from the network unless `HOST` is set explicitly
 * (e.g. `0.0.0.0` inside a container). Throws on a malformed `PORT` rather
 * than silently falling back.
 */
export function readListenConfig(env: NodeJS.ProcessEnv = process.env): ListenConfig {
  const host = env.HOST?.trim() || DEFAULT_HOST;
  const rawPort = env.PORT?.trim();
  if (!rawPort) {
    return { host, port: DEFAULT_PORT };
  }
  if (!/^\d+$/.test(rawPort)) {
    throw new Error(`PORT must be an integer from 0 to 65535, got "${rawPort}"`);
  }
  const port = Number(rawPort);
  if (port > 65535) {
    throw new Error(`PORT must be an integer from 0 to 65535, got "${rawPort}"`);
  }
  return { host, port };
}

/** Whether and for which departments the server scrapes sections on a schedule (T-403). */
export interface SectionScrapeConfig {
  enabled: boolean;
  departments: string[];
}

export const DEFAULT_SECTION_SCRAPE_DEPARTMENTS = ["CSC"];

/**
 * Reads `SECTION_SCRAPE_ENABLED` (`true` or `false`, default `false`, so a dev server never
 * scrapes the live portal by accident) and `SECTION_SCRAPE_DEPARTMENTS` (comma-separated
 * prefixes, default `CSC`). Throws on anything malformed rather than guessing.
 */
export function readSectionScrapeConfig(env: NodeJS.ProcessEnv = process.env): SectionScrapeConfig {
  const rawEnabled = env.SECTION_SCRAPE_ENABLED?.trim() || "false";
  if (rawEnabled !== "true" && rawEnabled !== "false") {
    throw new Error(`SECTION_SCRAPE_ENABLED must be "true" or "false", got "${rawEnabled}"`);
  }

  const rawDepartments = env.SECTION_SCRAPE_DEPARTMENTS?.trim();
  const departments = rawDepartments
    ? rawDepartments.split(",").map((department) => department.trim())
    : DEFAULT_SECTION_SCRAPE_DEPARTMENTS;
  const invalid = departments.find((department) => !DEPARTMENT_PATTERN.test(department));
  if (invalid !== undefined) {
    throw new Error(
      `SECTION_SCRAPE_DEPARTMENTS must be comma-separated 2-4 letter prefixes, got "${invalid}"`,
    );
  }
  return { enabled: rawEnabled === "true", departments: [...new Set(departments)] };
}
/** Whether the server scrapes the catalog on a schedule (T-611). */
export interface CatalogScrapeConfig {
  enabled: boolean;
}

/** Reads CATALOG_SCRAPE_ENABLED; the safe default keeps development servers offline. */
export function readCatalogScrapeConfig(env: NodeJS.ProcessEnv = process.env): CatalogScrapeConfig {
  const rawEnabled = env.CATALOG_SCRAPE_ENABLED?.trim() || "false";
  if (rawEnabled !== "true" && rawEnabled !== "false") {
    throw new Error(`CATALOG_SCRAPE_ENABLED must be "true" or "false", got "${rawEnabled}"`);
  }
  return { enabled: rawEnabled === "true" };
}
