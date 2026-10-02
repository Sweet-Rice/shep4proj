import type { IpcMainInvokeEvent } from "electron";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IPC_CHANNELS } from "../shared/ipc.js";
import { isAppRendererUrl, registerIpcHandlers, UntrustedIpcSenderError } from "./ipc.js";
import { createCompletedStore } from "./store/completed.js";
import { createPlanStore } from "./store/plan.js";
import { openLocalDb, type LocalDb } from "./store/db.js";

type Handler = (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown;

/** Records handlers the way `ipcMain.handle` would, and lets tests invoke them. */
function fakeIpcMain() {
  const handlers = new Map<string, Handler>();
  return {
    handle(channel: string, handler: Handler) {
      if (handlers.has(channel)) throw new Error(`duplicate handler for ${channel}`);
      handlers.set(channel, handler);
    },
    invoke(channel: string, ...args: unknown[]) {
      const handler = handlers.get(channel);
      if (!handler) throw new Error(`no handler for ${channel}`);
      return handler({} as IpcMainInvokeEvent, ...args);
    },
    channels: () => [...handlers.keys()],
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
  beforeEach(() => {
    db = openLocalDb(":memory:");
    ipc = fakeIpcMain();
    trusted = true;
    catalog = {
      listCourses: vi.fn().mockResolvedValue([]),
      getCourseDetails: vi.fn().mockResolvedValue({}),
      getCourseHistory: vi.fn().mockResolvedValue([]),
      listSections: vi.fn().mockResolvedValue([]),
      listDegrees: vi.fn().mockResolvedValue([]),
      getDegree: vi.fn().mockResolvedValue({}),
    };
    registerIpcHandlers(
      ipc,
      { completed: createCompletedStore(db), plan: createPlanStore(db), catalog },
      () => trusted,
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

  it("registers a handler for every channel", () => {
    expect(ipc.channels().sort()).toEqual(Object.values(IPC_CHANNELS).sort());
  });

  it("sets and gets completed courses", () => {
    ipc.invoke(IPC_CHANNELS.completedSet, "CSC 1350", true);
    expect(ipc.invoke(IPC_CHANNELS.completedGet)).toEqual(["CSC 1350"]);
  });

  it.each([
    ["no arguments", []],
    ["a malformed code", ["csc1350", true]],
    ["a non-boolean flag", ["CSC 1350", "yes"]],
    ["extra arguments", ["CSC 1350", true, "extra"]],
  ])("rejects %s", (_label, args) => {
    expect(() => ipc.invoke(IPC_CHANNELS.completedSet, ...args)).toThrow();
    expect(ipc.invoke(IPC_CHANNELS.completedGet)).toEqual([]);
  });

  it("saves and gets the plan", () => {
    const plan = {
      creditLimit: 15,
      terms: [{ season: "Fall", year: 2027, courses: ["CSC 3102"] }],
    };
    ipc.invoke(IPC_CHANNELS.planSave, plan);
    expect(ipc.invoke(IPC_CHANNELS.planGet)).toEqual(plan);
  });

  it.each([
    ["no plan", []],
    ["a plan without terms", [{ creditLimit: 15 }]],
    ["a plan without a credit limit", [{ terms: [] }]],
    [
      "a term with a bad season",
      [{ creditLimit: 15, terms: [{ season: "Autumn", year: 2027, courses: [] }] }],
    ],
  ])("rejects saving %s", (_label, args) => {
    expect(() => ipc.invoke(IPC_CHANNELS.planSave, ...args)).toThrow();
    expect(ipc.invoke(IPC_CHANNELS.planGet)).toEqual({ creditLimit: 19, terms: [] });
  });

  it("rejects calls from untrusted senders before touching the store", () => {
    trusted = false;
    expect(() => ipc.invoke(IPC_CHANNELS.completedSet, "CSC 1350", true)).toThrow(
      UntrustedIpcSenderError,
    );
    trusted = true;
    expect(ipc.invoke(IPC_CHANNELS.completedGet)).toEqual([]);
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
