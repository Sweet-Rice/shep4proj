import { describe, expect, it, vi } from "vitest";
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
  it("runs the first task without waiting", async () => {
    const clock = fakeClock();
    const delay = createCrawlDelay({ minIntervalMs: INTERVAL_MS, ...clock });
    const task = vi.fn(async () => "result");

    await expect(delay.run(task)).resolves.toBe("result");

    expect(clock.sleeps).toEqual([0]);
    expect(task).toHaveBeenCalledOnce();
  });

  it("waits the interval after the previous task finishes", async () => {
    const clock = fakeClock();
    const delay = createCrawlDelay({ minIntervalMs: INTERVAL_MS, ...clock });

    await delay.run(async () => undefined);
    await delay.run(async () => undefined);

    expect(clock.sleeps).toEqual([0, INTERVAL_MS]);
  });

  it("waits only the interval remaining since the previous task finished", async () => {
    const clock = fakeClock();
    const delay = createCrawlDelay({ minIntervalMs: INTERVAL_MS, ...clock });

    await delay.run(async () => undefined);
    clock.advance(30_000);
    await delay.run(async () => undefined);

    expect(clock.sleeps).toEqual([0, 90_000]);
  });

  it("does not wait when the interval already passed", async () => {
    const clock = fakeClock();
    const delay = createCrawlDelay({ minIntervalMs: INTERVAL_MS, ...clock });

    await delay.run(async () => undefined);
    clock.advance(200_000);
    await delay.run(async () => undefined);

    expect(clock.sleeps).toEqual([0, 0]);
  });

  it("starts the next task no earlier than an interval after a long task finishes", async () => {
    const clock = fakeClock();
    const delay = createCrawlDelay({ minIntervalMs: INTERVAL_MS, ...clock });
    let firstFinishedAt = 0;
    let secondStartedAt = 0;

    await delay.run(async () => {
      clock.advance(30_000);
      firstFinishedAt = clock.now();
    });
    await delay.run(async () => {
      secondStartedAt = clock.now();
    });

    expect(secondStartedAt - firstFinishedAt).toBeGreaterThanOrEqual(INTERVAL_MS);
    expect(clock.sleeps).toEqual([0, INTERVAL_MS]);
  });

  it("queues concurrent tasks in call order with separate intervals", async () => {
    const clock = fakeClock();
    const delay = createCrawlDelay({ minIntervalMs: INTERVAL_MS, ...clock });
    const order: number[] = [];

    await Promise.all(
      [0, 1, 2].map((index) =>
        delay.run(async () => {
          order.push(index);
        }),
      ),
    );

    expect(order).toEqual([0, 1, 2]);
    expect(clock.sleeps).toEqual([0, INTERVAL_MS, INTERVAL_MS]);
  });

  it("propagates task failures and keeps later callers working", async () => {
    const clock = fakeClock();
    const delay = createCrawlDelay({ minIntervalMs: INTERVAL_MS, ...clock });

    await expect(
      delay.run(async () => {
        throw new Error("task failed");
      }),
    ).rejects.toThrow("task failed");
    await expect(delay.run(async () => "continued")).resolves.toBe("continued");

    expect(clock.sleeps).toEqual([0, INTERVAL_MS]);
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

    await delay.run(async () => undefined);
    await expect(delay.run(async () => undefined)).rejects.toThrow("sleep failed");
    await expect(delay.run(async () => "continued")).resolves.toBe("continued");
  });

  it("uses the real clock and timers by default", async () => {
    const delay = createCrawlDelay({ minIntervalMs: 0 });

    await delay.run(async () => undefined);
    await expect(delay.run(async () => undefined)).resolves.toBeUndefined();
  });
});
