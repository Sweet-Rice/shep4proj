import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Plan } from "@jevschedule/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openLocalDb, type LocalDb } from "./db.js";
import { createPlanStore, type PlanStore } from "./plan.js";

const plan: Plan = {
  terms: [
    { season: "Spring", year: 2028, courses: ["CSC 4330", "CSC 3200"] },
    { season: "Fall", year: 2027, courses: ["CSC 3380", "CSC 3102"] },
    { season: "Summer", year: 2028, courses: [] },
  ],
};

describe("createPlanStore", () => {
  let db: LocalDb;
  let store: PlanStore;

  beforeEach(() => {
    db = openLocalDb(":memory:");
    store = createPlanStore(db);
  });
  afterEach(() => db.close());

  it("starts with an empty plan", () => {
    expect(store.getPlan()).toEqual({ terms: [] });
  });

  it("keeps terms and courses in the order they were saved", () => {
    store.savePlan(plan);
    expect(store.getPlan()).toEqual(plan);
  });

  it("replaces the previous plan on save", () => {
    store.savePlan(plan);
    const next: Plan = { terms: [{ season: "Fall", year: 2027, courses: ["CSC 3102"] }] };
    store.savePlan(next);
    expect(store.getPlan()).toEqual(next);
  });

  it("clears the plan when saving an empty one", () => {
    store.savePlan(plan);
    store.savePlan({ terms: [] });
    expect(store.getPlan()).toEqual({ terms: [] });
    expect(db.prepare("SELECT count(*) AS n FROM plan_courses").get()).toEqual({ n: 0 });
  });

  it("rejects an invalid plan and keeps the saved one", () => {
    store.savePlan(plan);
    const duplicateCourse = {
      terms: [
        { season: "Fall", year: 2027, courses: ["CSC 3102"] },
        { season: "Spring", year: 2028, courses: ["CSC 3102"] },
      ],
    } as Plan;
    expect(() => store.savePlan(duplicateCourse)).toThrow();
    expect(store.getPlan()).toEqual(plan);
  });
});

describe("plan persistence", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "jevschedule-plan-"));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("survives closing and reopening the database", () => {
    const file = join(dir, "local.sqlite");
    const first = openLocalDb(file);
    createPlanStore(first).savePlan(plan);
    first.close();

    const second = openLocalDb(file);
    expect(createPlanStore(second).getPlan()).toEqual(plan);
    second.close();
  });
});
