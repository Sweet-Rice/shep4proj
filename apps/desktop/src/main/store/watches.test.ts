import { expect, it } from "vitest";
import { openLocalDb } from "./db.js";
import { createWatchStore } from "./watches.js";

const watch = {
  id: "9ab43d1e-38a4-4fa2-82ee-33b66fe0eab7",
  term: "LSUAM_FALL_2026",
  courseCode: "CSC 4330",
  sectionNumber: "001",
  sectionType: "LEC",
};

it("persists watches and notification timestamps in the section_watches table", () => {
  const db = openLocalDb(":memory:");
  const store = createWatchStore(db);
  store.add(watch);
  expect(store.list()).toEqual([{ ...watch, lastNotifiedAt: null }]);

  const timestamp = "2026-10-01T12:00:00.000Z";
  store.markNotified(watch.id, timestamp);
  expect(store.list()[0]?.lastNotifiedAt).toBe(timestamp);
  expect(db.prepare("SELECT last_notified_at FROM section_watches").get()).toEqual({
    last_notified_at: timestamp,
  });
  store.remove(watch.id);
  expect(store.list()).toEqual([]);
  db.close();
});

it("rejects a second watch on the same section", () => {
  const db = openLocalDb(":memory:");
  const store = createWatchStore(db);
  store.add(watch);
  expect(() => store.add({ ...watch, id: "0f6b6a1c-3c2e-4b55-9d1f-2b8c5f0e7a11" })).toThrow(
    /UNIQUE/,
  );
  db.close();
});
