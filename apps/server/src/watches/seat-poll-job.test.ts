import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "../db/client.js";
import { startSeatPollJob } from "./seat-poll-job.js";

const DAY = 24 * 60 * 60 * 1000;

/** A real Fastify logger whose JSON lines land in `lines`. */
function captureLog() {
  const lines: string[] = [];
  const app = Fastify({ logger: { stream: { write: (line: string) => void lines.push(line) } } });
  return { log: app.log, lines };
}

/** A database that records any use instead of touching Postgres. */
function untouchedDb() {
  const used: PropertyKey[] = [];
  const db = new Proxy({}, { get: (_target, key) => void used.push(key) }) as Db;
  return { db, used };
}

describe("startSeatPollJob", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts nothing when SEAT_POLL_ENABLED is off", async () => {
    const { log, lines } = captureLog();
    const { db, used } = untouchedDb();
    const fetcher = { fetchHtml: vi.fn(async () => "") };

    const job = startSeatPollJob({ config: { enabled: false, intervalMs: DAY }, db, fetcher, log });
    await vi.advanceTimersByTimeAsync(2 * DAY);

    expect(job).toBeUndefined();
    expect(fetcher.fetchHtml).not.toHaveBeenCalled();
    expect(used).toEqual([]);
    expect(lines).toEqual([]);
  });

  it("warns and starts nothing when enabled without a database", async () => {
    const { log, lines } = captureLog();
    const fetcher = { fetchHtml: vi.fn(async () => "") };

    const job = startSeatPollJob({
      config: { enabled: true, intervalMs: DAY },
      db: undefined,
      fetcher,
      log,
    });
    await vi.advanceTimersByTimeAsync(2 * DAY);

    expect(job).toBeUndefined();
    expect(fetcher.fetchHtml).not.toHaveBeenCalled();
    expect(lines.map((line) => JSON.parse(line).msg)).toEqual([
      "SEAT_POLL_ENABLED is true but DATABASE_URL is not set; not polling seats",
    ]);
  });
});
