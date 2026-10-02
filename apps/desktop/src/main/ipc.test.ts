import type { IpcMainInvokeEvent } from "electron";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  IPC_CHANNELS,
  type WorkdayImportProgress,
  type WorkdayImportReview,
} from "../shared/ipc.js";
import { isAppRendererUrl, registerIpcHandlers, UntrustedIpcSenderError } from "./ipc.js";
import { CourseNotInCatalogError, NOT_IN_CATALOG_REASON } from "../shared/catalog-membership.js";
import { createCompletedStore } from "./store/completed.js";
import { createPlanStore } from "./store/plan.js";
import { openLocalDb, type LocalDb } from "./store/db.js";

type Handler = (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown;

/** Records handlers the way `ipcMain.handle` would, and lets tests invoke them. */
function fakeIpcMain() {
  const handlers = new Map<string, Handler>();
  const sent: unknown[][] = [];
  return {
    handle(channel: string, handler: Handler) {
      if (handlers.has(channel)) throw new Error(`duplicate handler for ${channel}`);
      handlers.set(channel, handler);
    },
    invoke(channel: string, ...args: unknown[]) {
      const handler = handlers.get(channel);
      if (!handler) throw new Error(`no handler for ${channel}`);
      return handler(
        {
          sender: { send: (...message: unknown[]) => sent.push(message) },
        } as unknown as IpcMainInvokeEvent,
        ...args,
      );
    },
    channels: () => [...handlers.keys()],
    sent,
  };
}

describe("registerIpcHandlers", () => {
  let db: LocalDb;
  let ipc: ReturnType<typeof fakeIpcMain>;
  let trusted: boolean;

  let catalog: {
    listCourses: ReturnType<typeof vi.fn>;
    getCourseDetails: ReturnType<typeof vi.fn>;
    getCourseHistory: ReturnType<typeof vi.fn>;
    listSections: ReturnType<typeof vi.fn>;
    listDegrees: ReturnType<typeof vi.fn>;
    getDegree: ReturnType<typeof vi.fn>;
  };
  let workday: { run: ReturnType<typeof vi.fn> };
  const importedReview: WorkdayImportReview = {
    completed: ["CSC 1350"],
    inProgress: [
      { season: "Fall", year: 2026, courses: ["CSC 4330"] },
      { season: "Spring", year: 2027, courses: ["CSC 1350"] },
    ],
    skipped: [],
  };
  beforeEach(() => {
    db = openLocalDb(":memory:");
    ipc = fakeIpcMain();
    trusted = true;
    catalog = {
      listCourses: vi.fn().mockResolvedValue([{ code: "CSC 1350" }, { code: "CSC 4330" }]),
      getCourseDetails: vi.fn().mockResolvedValue({}),
      getCourseHistory: vi.fn().mockResolvedValue([]),
      listSections: vi.fn().mockResolvedValue([]),
      listDegrees: vi.fn().mockResolvedValue([]),
      getDegree: vi.fn().mockResolvedValue({}),
    };
    workday = {
      run: vi.fn(async (emit: (progress: WorkdayImportProgress) => void) => {
        emit({ stage: "signing-in" });
        return importedReview;
      }),
    };
    registerIpcHandlers(
      ipc,
      { completed: createCompletedStore(db), plan: createPlanStore(db), catalog },
      () => trusted,
      undefined,
      { workday },
    );
  });
  it("forwards validated catalog calls", () => {
    const codes = ["CSC 1350"];
    ipc.invoke(IPC_CHANNELS.catalogCourses);
    ipc.invoke(IPC_CHANNELS.catalogCourseDetails, codes);
    ipc.invoke(IPC_CHANNELS.catalogCourseHistory, "CSC 1350");
    ipc.invoke(IPC_CHANNELS.catalogDegrees);
    ipc.invoke(IPC_CHANNELS.catalogDegree, "csc-software-engineering-2026-2027");
    ipc.invoke(IPC_CHANNELS.catalogSections, "CSC 1350", "LSUAM_FALL_2026");
    expect(catalog.listCourses).toHaveBeenCalledOnce();
    expect(catalog.getCourseDetails).toHaveBeenCalledWith(codes);
    expect(catalog.getCourseHistory).toHaveBeenCalledWith("CSC 1350");
    expect(catalog.listDegrees).toHaveBeenCalledOnce();
    expect(catalog.getDegree).toHaveBeenCalledWith("csc-software-engineering-2026-2027");
    expect(catalog.listSections).toHaveBeenCalledWith("CSC 1350", "LSUAM_FALL_2026");
  });

  it.each([
    [IPC_CHANNELS.catalogCourses, ["extra"]],
    [IPC_CHANNELS.catalogCourseDetails, ["csc1350"]],
    [IPC_CHANNELS.catalogCourseDetails, ["not-an-array"]],
    [IPC_CHANNELS.catalogCourseHistory, ["csc1350"]],
    [IPC_CHANNELS.catalogCourseHistory, []],
    [IPC_CHANNELS.catalogDegrees, ["extra"]],
    [IPC_CHANNELS.catalogDegree, ["CSC-degree"]],
    [IPC_CHANNELS.catalogDegree, ["csc degree"]],
    [IPC_CHANNELS.catalogSections, ["CSC 1350", "fall-2026"]],
    [IPC_CHANNELS.catalogSections, ["invalid", "LSUAM_FALL_2026"]],
  ])("rejects invalid catalog arguments for %s", (channel, args) => {
    expect(() => ipc.invoke(channel, ...args)).toThrow();
  });

  it("rejects an untrusted catalog call before contacting the client", () => {
    trusted = false;
    expect(() => ipc.invoke(IPC_CHANNELS.catalogCourses)).toThrow(UntrustedIpcSenderError);
    expect(catalog.listCourses).not.toHaveBeenCalled();
  });
  afterEach(() => db.close());

  it("registers a handler for every invoke channel", () => {
    expect(ipc.channels().sort()).toEqual(
      Object.values(IPC_CHANNELS)
        .filter((channel) => channel !== IPC_CHANNELS.workdayProgress)
        .sort(),
    );
  });
  it("forwards Workday import progress through the trusted sender", async () => {
    await expect(ipc.invoke(IPC_CHANNELS.workdayImport)).resolves.toEqual(importedReview);
    expect(workday.run).toHaveBeenCalledOnce();
    expect(ipc.sent).toEqual([[IPC_CHANNELS.workdayProgress, { stage: "signing-in" }]]);
  });

  it("filters Workday review courses absent from the catalog", async () => {
    workday.run.mockResolvedValue({
      completed: ["CSC 1350"],
      inProgress: [{ season: "Fall", year: 2026, courses: ["CSC 4330", "MATH 9999"] }],
      skipped: [],
    });
    await expect(ipc.invoke(IPC_CHANNELS.workdayImport)).resolves.toEqual({
      completed: ["CSC 1350"],
      inProgress: [{ season: "Fall", year: 2026, courses: ["CSC 4330"] }],
      skipped: [{ code: "MATH 9999", reason: NOT_IN_CATALOG_REASON }],
    });
  });

  it("rejects Workday import and confirm from untrusted senders without touching anything", () => {
    trusted = false;
    expect(() => ipc.invoke(IPC_CHANNELS.workdayImport)).toThrow(UntrustedIpcSenderError);
    expect(() => ipc.invoke(IPC_CHANNELS.workdayConfirm, importedReview)).toThrow(
      UntrustedIpcSenderError,
    );
    expect(workday.run).not.toHaveBeenCalled();
    expect(ipc.sent).toEqual([]);
    trusted = true;
    expect(ipc.invoke(IPC_CHANNELS.completedGet)).toEqual([]);
    expect(ipc.invoke(IPC_CHANNELS.planGet)).toMatchObject({ terms: [] });
  });

  it("stores nothing on Workday import and persists only on confirm", async () => {
    await ipc.invoke(IPC_CHANNELS.workdayImport);
    expect(ipc.invoke(IPC_CHANNELS.completedGet)).toEqual([]);
    expect(ipc.invoke(IPC_CHANNELS.planGet)).toMatchObject({ terms: [] });
    await ipc.invoke(IPC_CHANNELS.workdayConfirm, importedReview);
    expect(ipc.invoke(IPC_CHANNELS.completedGet)).toEqual(["CSC 1350"]);
    expect(ipc.invoke(IPC_CHANNELS.planGet)).toMatchObject({
      terms: [
        { season: "Fall", year: 2026, courses: ["CSC 4330"] },
        { season: "Spring", year: 2027, courses: ["CSC 1350"] },
      ],
    });
  });
  it("rejects Workday confirmation before writing any non-catalog course", async () => {
    await expect(
      ipc.invoke(IPC_CHANNELS.workdayConfirm, {
        completed: ["CSC 0000"],
        inProgress: [],
        skipped: [],
      }),
    ).rejects.toThrow(CourseNotInCatalogError);
    expect(ipc.invoke(IPC_CHANNELS.completedGet)).toEqual([]);
    expect(ipc.invoke(IPC_CHANNELS.planGet)).toMatchObject({ terms: [] });
  });

  it("saves confirmed Workday courses without duplicating planned codes", async () => {
    await ipc.invoke(IPC_CHANNELS.planSave, {
      creditLimit: 19,
      terms: [{ season: "Fall", year: 2026, courses: ["CSC 4330"] }],
    });
    await ipc.invoke(IPC_CHANNELS.workdayConfirm, importedReview);
    expect(ipc.invoke(IPC_CHANNELS.completedGet)).toEqual(["CSC 1350"]);
    expect(ipc.invoke(IPC_CHANNELS.planGet)).toEqual({
      creditLimit: 19,
      terms: [
        { season: "Fall", year: 2026, courses: ["CSC 4330"] },
        { season: "Spring", year: 2027, courses: ["CSC 1350"] },
      ],
    });
    expect(ipc.sent.at(-1)).toEqual([IPC_CHANNELS.workdayProgress, { stage: "done" }]);
  });

  it("rejects completing a code absent from the catalog", async () => {
    await expect(ipc.invoke(IPC_CHANNELS.completedSet, "CSC 0000", true)).rejects.toThrow(
      CourseNotInCatalogError,
    );
    expect(ipc.invoke(IPC_CHANNELS.completedGet)).toEqual([]);
  });

  it("allows unmarking a code absent from the catalog", async () => {
    await expect(ipc.invoke(IPC_CHANNELS.completedSet, "CSC 0000", false)).resolves.toBeUndefined();
  });

  it("allows completing a catalog course", async () => {
    await ipc.invoke(IPC_CHANNELS.completedSet, "CSC 1350", true);
    expect(ipc.invoke(IPC_CHANNELS.completedGet)).toEqual(["CSC 1350"]);
  });

  it.each([
    ["no arguments", []],
    ["a malformed code", ["csc1350", true]],
    ["a non-boolean flag", ["CSC 1350", "yes"]],
    ["extra arguments", ["CSC 1350", true, "extra"]],
  ])("rejects %s", async (_label, args) => {
    await expect(ipc.invoke(IPC_CHANNELS.completedSet, ...args)).rejects.toThrow();
    expect(ipc.invoke(IPC_CHANNELS.completedGet)).toEqual([]);
  });

  it("saves and gets a plan with catalog courses", async () => {
    const plan = {
      creditLimit: 15,
      terms: [{ season: "Fall", year: 2027, courses: ["CSC 1350"] }],
    };
    await ipc.invoke(IPC_CHANNELS.planSave, plan);
    expect(ipc.invoke(IPC_CHANNELS.planGet)).toEqual(plan);
  });

  it("rejects adding an absent catalog course and allows offline reorder", async () => {
    await expect(
      ipc.invoke(IPC_CHANNELS.planSave, {
        creditLimit: 15,
        terms: [{ season: "Fall", year: 2027, courses: ["CSC 0000"] }],
      }),
    ).rejects.toThrow(CourseNotInCatalogError);
    const plan = {
      creditLimit: 15,
      terms: [{ season: "Fall", year: 2027, courses: ["CSC 1350", "CSC 4330"] }],
    };
    await ipc.invoke(IPC_CHANNELS.planSave, plan);
    catalog.listCourses.mockRejectedValue(new Error("offline"));
    const reordered = {
      ...plan,
      terms: [{ ...plan.terms[0], courses: ["CSC 4330", "CSC 1350"] }],
    };
    await ipc.invoke(IPC_CHANNELS.planSave, reordered);
    expect(ipc.invoke(IPC_CHANNELS.planGet)).toEqual(reordered);
  });

  it.each([
    ["no plan", []],
    ["a plan without terms", [{ creditLimit: 15 }]],
    ["a plan without a credit limit", [{ terms: [] }]],
    [
      "a term with a bad season",
      [{ creditLimit: 15, terms: [{ season: "Autumn", year: 2027, courses: [] }] }],
    ],
  ])("rejects saving %s", async (_label, args) => {
    await expect(ipc.invoke(IPC_CHANNELS.planSave, ...args)).rejects.toThrow();
    expect(ipc.invoke(IPC_CHANNELS.planGet)).toEqual({ creditLimit: 19, terms: [] });
  });

  it("rejects transcript picker arguments and untrusted frames", async () => {
    expect(() => ipc.invoke(IPC_CHANNELS.transcriptSelect, "C:/unexpected.pdf")).toThrow();
    trusted = false;
    expect(() => ipc.invoke(IPC_CHANNELS.transcriptSelect)).toThrow(UntrustedIpcSenderError);
    trusted = true;
    await expect(ipc.invoke(IPC_CHANNELS.transcriptSelect)).resolves.toBeNull();
  });
});

describe("isAppRendererUrl", () => {
  it.each([
    ["dev server page", "http://localhost:5173/", "http://localhost:5173/", true],
    ["dev server subpath", "http://localhost:5173/#/plan", "http://localhost:5173/", true],
    ["other origin", "https://example.com/", "http://localhost:5173/", false],
    ["other port", "http://localhost:5174/", "http://localhost:5173/", false],
    [
      "packaged page",
      "file:///app/out/renderer/index.html",
      "file:///app/out/renderer/index.html",
      true,
    ],
    [
      "packaged page with hash",
      "file:///app/out/renderer/index.html#/plan",
      "file:///app/out/renderer/index.html",
      true,
    ],
    ["other file", "file:///tmp/evil.html", "file:///app/out/renderer/index.html", false],
    ["missing frame", undefined, "http://localhost:5173/", false],
    ["unparseable url", "not a url", "http://localhost:5173/", false],
  ])("%s", (_label, frameUrl, rendererUrl, expected) => {
    expect(isAppRendererUrl(frameUrl, rendererUrl)).toBe(expected);
  });
});
