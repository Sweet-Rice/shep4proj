import { setTimeout as sleepFor } from "node:timers/promises";

/** Spaces calls by their completion time; `run()` also serializes the request body. */
export interface CrawlDelay {
  wait(): Promise<void>;
  /** Runs one request at a time and spaces the next from this one's completion. */
  run<T>(task: () => Promise<T>): Promise<T>;
}

/**
 * Creates a crawl-delay gate. The first `wait()` resolves immediately; every
 * later one resolves no earlier than `minIntervalMs` after the previous
 * `wait()` resolved. Concurrent calls are queued, so each one gets its own
 * interval instead of resolving together.
 *
 * `run()` holds the queue until its task settles, then starts the interval for
 * the next call. Use it when work may continue after a request begins (such as
 * a browser challenge). `now` and `sleep` are injectable for fake-clock tests.
 */
export function createCrawlDelay(opts: {
  minIntervalMs: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}): CrawlDelay {
  const now = opts.now ?? Date.now;
  const sleep = opts.sleep ?? sleepFor;
  let lastResolvedAt: number | undefined;
  let queue: Promise<void> = Promise.resolve();

  return {
    wait(): Promise<void> {
      const turn = queue.then(async () => {
        const remainingMs =
          lastResolvedAt === undefined
            ? 0
            : Math.max(0, lastResolvedAt + opts.minIntervalMs - now());
        await sleep(remainingMs);
        lastResolvedAt = now();
      });
      // A failing sleep must not wedge every later caller.
      queue = turn.catch(() => undefined);
      return turn;
    },
    run<T>(task: () => Promise<T>): Promise<T> {
      const turn = queue.then(async () => {
        const remainingMs =
          lastResolvedAt === undefined
            ? 0
            : Math.max(0, lastResolvedAt + opts.minIntervalMs - now());
        await sleep(remainingMs);
        try {
          return await task();
        } finally {
          lastResolvedAt = now();
        }
      });
      queue = turn.then(
        () => undefined,
        () => undefined,
      );
      return turn;
    },
  };
}
