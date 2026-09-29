import { setTimeout as sleepFor } from "node:timers/promises";

/** Spaces out requests: each `wait()` resolves at least `minIntervalMs` after the previous one did. */
export interface CrawlDelay {
  wait(): Promise<void>;
}

/**
 * Creates a crawl-delay gate. The first `wait()` resolves immediately; every
 * later one resolves no earlier than `minIntervalMs` after the previous
 * `wait()` resolved. Concurrent calls are queued, so each one gets its own
 * interval instead of resolving together.
 *
 * `sleep` is called once per `wait()` with the milliseconds still to wait
 * (`0` when the interval has already passed). `now` and `sleep` are injectable
 * so tests need neither a real clock nor real waiting.
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
  };
}
