import { setTimeout as sleepFor } from "node:timers/promises";

/** Queues tasks so each starts at least `minIntervalMs` after the previous task finished. */
export interface CrawlDelay {
  run<T>(task: () => Promise<T>): Promise<T>;
}

/**
 * Creates a crawl-delay gate. The first task starts immediately; every later
 * task starts no earlier than `minIntervalMs` after the previous task settled.
 * Concurrent calls are queued in call order.
 *
 * `sleep` is called once per task with the milliseconds still to wait (`0`
 * when the interval has already passed). `now` and `sleep` are injectable so
 * tests need neither a real clock nor real waiting.
 */

export function createCrawlDelay(opts: {
  minIntervalMs: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}): CrawlDelay {
  const now = opts.now ?? Date.now;
  const sleep = opts.sleep ?? sleepFor;
  let lastFinishedAt: number | undefined;
  let queue: Promise<void> = Promise.resolve();

  return {
    run<T>(task: () => Promise<T>): Promise<T> {
      const turn = queue.then(async () => {
        const remainingMs =
          lastFinishedAt === undefined
            ? 0
            : Math.max(0, lastFinishedAt + opts.minIntervalMs - now());
        await sleep(remainingMs);
        try {
          return await task();
        } finally {
          lastFinishedAt = now();
        }
      });
      // A failing sleep or task must not wedge every later caller.
      queue = turn.then(
        () => undefined,
        () => undefined,
      );
      return turn;
    },
  };
}
