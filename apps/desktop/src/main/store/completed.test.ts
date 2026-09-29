import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createCompletedStore, type CompletedStore } from "./completed.js";
import { openLocalDb, type LocalDb } from "./db.js";

describe("createCompletedStore", () => {
  let db: LocalDb;
  let store: CompletedStore;

  beforeEach(() => {
    db = openLocalDb(":memory:");
    store = createCompletedStore(db);
  });
  afterEach(() => db.close());

  it("starts empty", () => {
    expect(store.getCompleted()).toEqual([]);
  });

  it("returns completed courses sorted by code", () => {
    store.setCompleted("MATH 1550", true);
    store.setCompleted("CSC 3102", true);
    store.setCompleted("CSC 1350", true);
    expect(store.getCompleted()).toEqual(["CSC 1350", "CSC 3102", "MATH 1550"]);
  });

  it("unmarks a course", () => {
    store.setCompleted("CSC 1350", true);
    store.setCompleted("CSC 1350", false);
    expect(store.getCompleted()).toEqual([]);
  });

  it("treats repeating the current state as a no-op", () => {
    store.setCompleted("CSC 1350", true);
    store.setCompleted("CSC 1350", true);
    store.setCompleted("CSC 3102", false);
    expect(store.getCompleted()).toEqual(["CSC 1350"]);
  });

  it.each(["csc 1350", "CSC1350", "CSC 135", "", "CSC 1350; DROP TABLE completed_courses"])(
    "rejects malformed course code %j",
    (code) => {
      expect(() => store.setCompleted(code, true)).toThrow();
      expect(store.getCompleted()).toEqual([]);
    },
  );
});

describe("completed courses persistence", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "jevschedule-completed-"));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("survives closing and reopening the database", () => {
    const file = join(dir, "local.sqlite");
    const first = openLocalDb(file);
    createCompletedStore(first).setCompleted("CSC 4330", true);
    first.close();

    const second = openLocalDb(file);
    expect(createCompletedStore(second).getCompleted()).toEqual(["CSC 4330"]);
    second.close();
  });
});
