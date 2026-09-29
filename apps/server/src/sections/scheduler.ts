/**
 * How often the scheduled section scrape wakes up. Each wake-up only fetches terms whose last
 * scrape is at least a day old (`SECTION_SCRAPE_MIN_INTERVAL_MS`), so checking hourly picks up
 * new terms and recovers from failures within the hour without scraping any term more than
 * once a day. The check itself is one landing-page request per department.
 */
export const SECTION_SCRAPE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

export interface Schedule {
  /** Cancels future runs and resolves once any run in progress has finished. */
  stop(): Promise<void>;
}

/**
 * Runs `run` now and then again `intervalMs` after each run finishes (T-403). Runs never
 * overlap, and a failed run is passed to `onError` without stopping the schedule. The timer is
 * unref'd so it never keeps the process alive on its own.
 */
export function startSectionScrapeSchedule(o: {
  run: () => Promise<void>;
  onError: (error: unknown) => void;
  intervalMs?: number;
}): Schedule {
  const intervalMs = o.intervalMs ?? SECTION_SCRAPE_CHECK_INTERVAL_MS;
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;
  let running: Promise<void> | undefined;

  function tick(): void {
    running = o
      .run()
      .catch(o.onError)
      .finally(() => {
        running = undefined;
        if (!stopped) timer = setTimeout(tick, intervalMs).unref();
      });
  }

  tick();
  return {
    async stop() {
      stopped = true;
      clearTimeout(timer);
      await running;
    },
  };
}
