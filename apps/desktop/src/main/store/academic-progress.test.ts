import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AcademicProgressResult } from "@jevschedule/workday/academic-progress";
import { createAcademicProgressStore, type AcademicProgressStore } from "./academic-progress.js";
import { openLocalDb, type LocalDb } from "./db.js";

const audit: AcademicProgressResult = {
  overall: {
    definedCredits: 120,
    inProgressCredits: 3,
    satisfyingCredits: 90,
    remainingCredits: 30,
    status: "In Progress",
  },
  requirements: [
    {
      name: "Core Writing",
      status: "satisfied",
      statusText: "Satisfied",
      remaining: "0",
      satisfiedWith: [
        {
          code: "ENGL 1001",
          text: "ENGL 1001 - English Composition",
          academicPeriod: "Fall Semester 2025",
          creditHours: 3,
        },
      ],
    },
  ],
  unrecognizedRows: [],
};

describe("createAcademicProgressStore", () => {
  let db: LocalDb;
  let store: AcademicProgressStore;

  beforeEach(() => {
    db = openLocalDb(":memory:");
    store = createAcademicProgressStore(db);
  });
  afterEach(() => db.close());

  it("starts without an imported audit", () => {
    expect(store.getAudit()).toBeNull();
  });

  it("stores the audit and its import time", () => {
    store.saveAudit(audit, "2026-10-02T13:40:00.000Z");
    expect(store.getAudit()).toEqual({ importedAt: "2026-10-02T13:40:00.000Z", result: audit });
  });
});

describe("academic progress persistence", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "jevschedule-academic-progress-"));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("replaces and retains the latest audit when the local database is reopened", () => {
    const file = join(dir, "local.sqlite");
    const first = openLocalDb(file);
    const store = createAcademicProgressStore(first);
    store.saveAudit(audit, "2026-10-02T13:40:00.000Z");
    const replacement = { ...audit, overall: { ...audit.overall, satisfyingCredits: 93 } };
    store.saveAudit(replacement, "2026-10-03T13:40:00.000Z");
    first.close();

    const second = openLocalDb(file);
    expect(createAcademicProgressStore(second).getAudit()).toEqual({
      importedAt: "2026-10-03T13:40:00.000Z",
      result: replacement,
    });
    second.close();
  });
});
