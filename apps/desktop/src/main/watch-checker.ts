import type { WatchClient, WatchStatus } from "./watches.js";
import type { WatchStore } from "./store/watches.js";

export const DEFAULT_WATCH_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

export interface WatchChecker {
  check(): Promise<void>;
  stop(): void;
}

/** Electron notification options announcing a newly opened seat. */
export function seatOpeningNotification(watch: WatchStatus): { title: string; body: string } {
  return {
    title: `Seat open: ${watch.courseCode} ${watch.sectionNumber}`,
    body: `${watch.capacity - watch.enrollment} of ${watch.capacity} seats open. Seat counts update daily.`,
  };
}

/**
 * Checks server-side opening timestamps and delivers each newly observed opening once. The
 * notification checkpoint stores the server's opening time, so client clock skew cannot
 * suppress or repeat an alert.
 */
export function startWatchChecker(o: {
  store: WatchStore;
  client: Pick<WatchClient, "get">;
  notify: (watch: WatchStatus) => void | Promise<void>;
  intervalMs?: number;
}): WatchChecker {
  let checking: Promise<void> | undefined;
  const check = async () => {
    if (checking) return checking;
    checking = (async () => {
      let watches;
      try {
        watches = o.store.list();
      } catch {
        return;
      }
      for (const watch of watches) {
        try {
          const current = await o.client.get(watch.id);
          if (current === null) {
            o.store.remove(watch.id);
            continue;
          }
          if (current.lastOpenedAt === null) continue;
          if (
            watch.lastNotifiedAt !== null &&
            Date.parse(current.lastOpenedAt) <= Date.parse(watch.lastNotifiedAt)
          ) {
            continue;
          }
          await o.notify(current);
          o.store.markNotified(watch.id, current.lastOpenedAt);
        } catch {
          // A failed check or notification must not stop checking other watches or crash Electron.
        }
      }
    })();
    try {
      await checking;
    } finally {
      checking = undefined;
    }
  };
  const timer = setInterval(() => void check(), o.intervalMs ?? DEFAULT_WATCH_CHECK_INTERVAL_MS);
  void check();
  return {
    check,
    stop: () => clearInterval(timer),
  };
}
