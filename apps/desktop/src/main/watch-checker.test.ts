import { afterEach, describe, expect, it, vi } from "vitest";
import type { LocalWatch, WatchStore } from "./store/watches.js";
import type { WatchStatus } from "./watches.js";
import { seatOpeningNotification, startWatchChecker } from "./watch-checker.js";

const detail: WatchStatus = {
  term: "LSUAM_FALL_2026",
  courseCode: "CSC 4330",
  sectionNumber: "001",
  sectionType: "LEC",
  enrollment: 78,
  capacity: 80,
  lastOpenedAt: "2026-10-01T12:00:00.000Z",
};
const local = (id: string, lastNotifiedAt: string | null = null): LocalWatch => ({
  id,
  term: detail.term,
  courseCode: detail.courseCode,
  sectionNumber: detail.sectionNumber,
  sectionType: detail.sectionType,
  lastNotifiedAt,
});

function storeWith(...watches: LocalWatch[]) {
  const rows = new Map(watches.map((watch) => [watch.id, watch]));
  const store: WatchStore = {
    list: () => [...rows.values()],
    add: (watch) => rows.set(watch.id, { ...watch, lastNotifiedAt: null }),
    remove: (id) => void rows.delete(id),
    markNotified: (id, timestamp) => {
      const watch = rows.get(id);
      if (watch) rows.set(id, { ...watch, lastNotifiedAt: timestamp });
    },
  };
  return { store, rows };
}

afterEach(() => vi.useRealTimers());

describe("seatOpeningNotification", () => {
  it("reports the course and number of open seats with the daily refresh notice", () => {
    expect(seatOpeningNotification(detail)).toEqual({
      title: "Seat open: CSC 4330 001",
      body: "2 of 80 seats open. Seat counts update daily.",
    });
  });
});

describe("startWatchChecker", () => {
  it("notifies once for each new opening and records the delivered timestamp", async () => {
    const timestamp = detail.lastOpenedAt!;
    const { store, rows } = storeWith(local("first"));
    const client = { get: vi.fn(async () => detail) };
    const notify = vi.fn();
    const checker = startWatchChecker({ store, client, notify, intervalMs: 50 });
    await checker.check();
    await checker.check();

    expect(notify).toHaveBeenCalledTimes(1);
    expect(rows.get("first")?.lastNotifiedAt).toBe(timestamp);

    const later = { ...detail, lastOpenedAt: "2026-10-02T12:00:00.000Z" };
    client.get.mockResolvedValue(later);
    await checker.check();
    expect(notify).toHaveBeenCalledTimes(2);
    expect(rows.get("first")?.lastNotifiedAt).toBe(later.lastOpenedAt);
    checker.stop();
  });

  it("does not notify for an opening no later than the last notification", async () => {
    const { store, rows } = storeWith(local("seen", "2026-10-03T00:00:00.000Z"));
    const notify = vi.fn();
    const checker = startWatchChecker({
      store,
      client: { get: vi.fn(async () => detail) },
      notify,
    });
    await checker.check();
    expect(notify).not.toHaveBeenCalled();
    expect(rows.get("seen")?.lastNotifiedAt).toBe("2026-10-03T00:00:00.000Z");
    checker.stop();
  });

  it.each([null, "2026-10-01T00:00:00.000Z"])(
    "never notifies or advances the checkpoint for a never-opened watch (last notified %s)",
    async (lastNotifiedAt) => {
      const { store, rows } = storeWith(local("unopened", lastNotifiedAt));
      const notify = vi.fn();
      const markNotified = vi.spyOn(store, "markNotified");
      const checker = startWatchChecker({
        store,
        client: { get: vi.fn(async () => ({ ...detail, lastOpenedAt: null })) },
        notify,
      });
      await checker.check();
      expect(notify).not.toHaveBeenCalled();
      expect(markNotified).not.toHaveBeenCalled();
      expect(rows.get("unopened")?.lastNotifiedAt).toBe(lastNotifiedAt);
      checker.stop();
    },
  );

  it("removes local watches that the server no longer knows", async () => {
    const { store, rows } = storeWith(local("deleted"));
    const checker = startWatchChecker({
      store,
      client: { get: vi.fn(async () => null) },
      notify: vi.fn(),
    });
    await checker.check();
    expect(rows.has("deleted")).toBe(false);
    checker.stop();
  });

  it("continues after API and notification failures and checks on the interval", async () => {
    vi.useFakeTimers();
    const { store } = storeWith(local("retry"));
    const get = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(detail);
    const notify = vi.fn().mockRejectedValueOnce(new Error("notification unavailable"));
    const checker = startWatchChecker({ store, client: { get }, notify, intervalMs: 100 });
    await vi.advanceTimersByTimeAsync(0);
    expect(get).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(100);
    expect(get).toHaveBeenCalledTimes(2);
    expect(notify).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(100);
    expect(notify).toHaveBeenCalledTimes(2);
    checker.stop();
  });

  it("still notifies later watches when looking up an earlier watch fails", async () => {
    const { store, rows } = storeWith(local("a"), local("b"));
    const get = vi.fn(async (id: string) => {
      if (id === "a") throw new Error("offline");
      return detail;
    });
    const notify = vi.fn();
    const checker = startWatchChecker({ store, client: { get }, notify });
    await checker.check();

    expect(notify).toHaveBeenCalledTimes(1);
    expect(rows.get("a")?.lastNotifiedAt).toBeNull();
    expect(rows.get("b")?.lastNotifiedAt).toBe(detail.lastOpenedAt);
    checker.stop();
  });

  it("still notifies later watches when delivering an earlier notification fails", async () => {
    const { store, rows } = storeWith(local("a"), local("b"));
    const notify = vi.fn().mockRejectedValueOnce(new Error("notification unavailable"));
    const checker = startWatchChecker({
      store,
      client: { get: vi.fn(async () => detail) },
      notify,
    });
    await checker.check();

    expect(notify).toHaveBeenCalledTimes(2);
    expect(rows.get("a")?.lastNotifiedAt).toBeNull();
    expect(rows.get("b")?.lastNotifiedAt).toBe(detail.lastOpenedAt);

    await checker.check();
    expect(notify).toHaveBeenCalledTimes(3);
    expect(rows.get("a")?.lastNotifiedAt).toBe(detail.lastOpenedAt);
    checker.stop();
  });
});
