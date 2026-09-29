import { describe, expect, it } from "vitest";
import { createCrawlDelay } from "./crawl-delay.js";

const INTERVAL_MS = 120_000;

/** A clock that only moves when the test advances it or the code under test sleeps. */
function fakeClock() {
  let time = 1_000_000;
  const sleeps: number[] = [];
  return {
    sleeps,
    now: () => time,
    advance: (ms: number) => {
      time += ms;
    },
    sleep: (ms: number): Promise<void> => {
      sleeps.push(ms);
      time += ms;
      return Promise.resolve();
    },
  };
}

describe("createCrawlDelay", () => {
  it("does not wait before the first request", async () => {
    const clock = fakeClock();
    const delay = createCrawlDelay({ minIntervalMs: INTERVAL_MS, ...clock });

    await delay.wait();

    expect(clock.sleeps).toEqual([0]);
  });

  it("waits the full interval when called right after the previous request", async () => {
    const clock = fakeClock();
    const delay = createCrawlDelay({ minIntervalMs: INTERVAL_MS, ...clock });

    await delay.wait();
    await delay.wait();

    expect(clock.sleeps).toEqual([0, 120_000]);
  });

  it("waits only what is left of the interval", async () => {
    const clock = fakeClock();
    const delay = createCrawlDelay({ minIntervalMs: INTERVAL_MS, ...clock });

    await delay.wait();
    clock.advance(30_000);
    await delay.wait();

    expect(clock.sleeps).toEqual([0, 90_000]);
  });

  it("does not wait when the interval already passed", async () => {
    const clock = fakeClock();
    const delay = createCrawlDelay({ minIntervalMs: INTERVAL_MS, ...clock });

    await delay.wait();
    clock.advance(200_000);
    await delay.wait();

    expect(clock.sleeps).toEqual([0, 0]);
  });

  it("measures the interval from when the previous wait resolved", async () => {
    const clock = fakeClock();
    const delay = createCrawlDelay({ minIntervalMs: INTERVAL_MS, ...clock });

    await delay.wait();
    await delay.wait();
    clock.advance(20_000);
    await delay.wait();

    expect(clock.sleeps).toEqual([0, 120_000, 100_000]);
  });

  it("gives concurrent callers separate intervals", async () => {
    const clock = fakeClock();
    const delay = createCrawlDelay({ minIntervalMs: INTERVAL_MS, ...clock });
    const resolvedAt: number[] = [];

    await Promise.all(
      [0, 1, 2].map(async () => {
        await delay.wait();
        resolvedAt.push(clock.now());
      }),
    );

    expect(clock.sleeps).toEqual([0, 120_000, 120_000]);
    const [first = 0, second = 0, third = 0] = resolvedAt;
    expect(second - first).toBe(120_000);
    expect(third - second).toBe(120_000);
  });

  it("keeps later callers working after a sleep fails", async () => {
    const clock = fakeClock();
    let calls = 0;
    const delay = createCrawlDelay({
      minIntervalMs: INTERVAL_MS,
      now: clock.now,
      sleep: (ms) => {
        calls += 1;
        return calls === 2 ? Promise.reject(new Error("sleep failed")) : clock.sleep(ms);
      },
    });

    await delay.wait();
    await expect(delay.wait()).rejects.toThrow("sleep failed");
    await expect(delay.wait()).resolves.toBeUndefined();
  });

  it("uses the real clock and timers by default", async () => {
    const delay = createCrawlDelay({ minIntervalMs: 0 });

    await delay.wait();
    await expect(delay.wait()).resolves.toBeUndefined();
  });
});
