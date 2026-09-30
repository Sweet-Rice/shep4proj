import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startSectionScrapeSchedule } from "./scheduler.js";

const HOUR = 60 * 60 * 1000;

/** A run that stays in progress until the test calls `finish`. */
function controllableRun() {
  let finish: () => void = () => undefined;
  const run = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  return { run, finish: () => finish() };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("startSectionScrapeSchedule", () => {
  it("runs immediately and then once per interval", async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    const schedule = startSectionScrapeSchedule({ run, onError: vi.fn(), intervalMs: HOUR });
    expect(run).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(HOUR - 1);
    expect(run).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(run).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(HOUR);
    expect(run).toHaveBeenCalledTimes(3);

    await schedule.stop();
  });

  it("waits for a slow run to finish before timing the next one", async () => {
    const { run, finish } = controllableRun();
    const schedule = startSectionScrapeSchedule({ run, onError: vi.fn(), intervalMs: HOUR });

    await vi.advanceTimersByTimeAsync(3 * HOUR);
    expect(run).toHaveBeenCalledTimes(1);

    finish();
    await vi.advanceTimersByTimeAsync(HOUR);
    expect(run).toHaveBeenCalledTimes(2);

    finish();
    await schedule.stop();
  });

  it("reports a failed run and keeps the schedule going", async () => {
    const error = new Error("portal down");
    const run = vi.fn().mockRejectedValueOnce(error).mockResolvedValue(undefined);
    const onError = vi.fn();
    const schedule = startSectionScrapeSchedule({ run, onError, intervalMs: HOUR });

    await vi.advanceTimersByTimeAsync(0);
    expect(onError).toHaveBeenCalledWith(error);
    await vi.advanceTimersByTimeAsync(HOUR);
    expect(run).toHaveBeenCalledTimes(2);

    await schedule.stop();
  });

  it("stops scheduling after stop()", async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    const schedule = startSectionScrapeSchedule({ run, onError: vi.fn(), intervalMs: HOUR });
    await schedule.stop();

    await vi.advanceTimersByTimeAsync(5 * HOUR);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("lets stop() wait for the run in progress, then schedules nothing more", async () => {
    const { run, finish } = controllableRun();
    const schedule = startSectionScrapeSchedule({ run, onError: vi.fn(), intervalMs: HOUR });

    let stopped = false;
    const stopping = schedule.stop().then(() => {
      stopped = true;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(stopped).toBe(false);

    finish();
    await stopping;
    await vi.advanceTimersByTimeAsync(5 * HOUR);
    expect(run).toHaveBeenCalledTimes(1);
  });
});
