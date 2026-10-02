import type { FastifyBaseLogger } from "fastify";
import type { SectionFetcher } from "@jevschedule/scraper";
import type { SeatPollConfig } from "../config.js";
import type { Db } from "../db/client.js";
import type { Schedule } from "../sections/scheduler.js";
import { pollWatchedSeats, startSeatPoller, type SeatPollResult } from "./seat-poller.js";

/**
 * One seat poll that logs openings and outcome. The desktop checks `lastOpenedAt` for native
 * notifications. Logs name the section, never the watch ID: that's the student's bearer token.
 */
export function createSeatPollRun(o: {
  db: Db;
  fetcher: SectionFetcher;
  log: FastifyBaseLogger;
  onError: (error: unknown) => void;
}): () => Promise<SeatPollResult> {
  return async () => {
    const result = await pollWatchedSeats({
      db: o.db,
      fetcher: o.fetcher,
      onSeatsOpened: ({ watchId: _watchId, ...opening }) => o.log.info(opening, "seats opened"),
      onError: o.onError,
    });
    if (result.failed.length > 0) {
      o.log.warn(result, "seat poll finished with failures");
    } else {
      o.log.info(result, "seat poll finished");
    }
    return result;
  };
}

/** Starts the seat poller (T-512) when enabled; it needs the database. */
export function startSeatPollJob(o: {
  config: SeatPollConfig;
  db: Db | undefined;
  fetcher: SectionFetcher;
  log: FastifyBaseLogger;
}): Schedule | undefined {
  if (!o.config.enabled) return undefined;
  if (!o.db) {
    o.log.warn("SEAT_POLL_ENABLED is true but DATABASE_URL is not set; not polling seats");
    return undefined;
  }
  const log = o.log.child({ job: "seat-poll" });
  const onError = (error: unknown) => log.error(error, "seat poll failed");
  return startSeatPoller({
    intervalMs: o.config.intervalMs,
    onError,
    poll: createSeatPollRun({ db: o.db, fetcher: o.fetcher, log, onError }),
  });
}
