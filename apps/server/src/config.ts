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

/** Whether and how often the server polls watched sections for open seats (T-512). */
export interface SeatPollConfig {
  enabled: boolean;
  intervalMs: number;
}

/** LSU refreshes seat counts daily (T-005), so polling more often finds nothing new. */
export const DEFAULT_SEAT_POLL_INTERVAL_MINUTES = 24 * 60;

/** Floor on the poll interval, so a typo can't turn the poller into a crawler. */
export const MIN_SEAT_POLL_INTERVAL_MINUTES = 60;

/**
 * Reads `SEAT_POLL_ENABLED` (`true` or `false`, default `false`, so a dev server never polls
 * the live portal by accident) and `SEAT_POLL_INTERVAL_MINUTES` (whole minutes, default 1440,
 * at least 60). Throws on anything malformed rather than guessing.
 */
export function readSeatPollConfig(env: NodeJS.ProcessEnv = process.env): SeatPollConfig {
  const rawEnabled = env.SEAT_POLL_ENABLED?.trim() || "false";
  if (rawEnabled !== "true" && rawEnabled !== "false") {
    throw new Error(`SEAT_POLL_ENABLED must be "true" or "false", got "${rawEnabled}"`);
  }

  const rawInterval = env.SEAT_POLL_INTERVAL_MINUTES?.trim();
  let minutes = DEFAULT_SEAT_POLL_INTERVAL_MINUTES;
  if (rawInterval) {
    // The upper bound keeps the interval within setTimeout's 32-bit millisecond limit.
    minutes = /^\d+$/.test(rawInterval) ? Number(rawInterval) : NaN;
    if (!(minutes >= MIN_SEAT_POLL_INTERVAL_MINUTES && minutes <= 35_000)) {
      throw new Error(
        `SEAT_POLL_INTERVAL_MINUTES must be an integer from ${MIN_SEAT_POLL_INTERVAL_MINUTES} ` +
          `to 35000, got "${rawInterval}"`,
      );
    }
  }
  return { enabled: rawEnabled === "true", intervalMs: minutes * 60 * 1000 };
}
