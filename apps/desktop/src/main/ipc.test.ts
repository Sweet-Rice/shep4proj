import type { IpcMainInvokeEvent } from "electron";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { IPC_CHANNELS } from "../shared/ipc.js";
import { isAppRendererUrl, registerIpcHandlers, UntrustedIpcSenderError } from "./ipc.js";
import { createCompletedStore } from "./store/completed.js";
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

  beforeEach(() => {
    db = openLocalDb(":memory:");
    ipc = fakeIpcMain();
    trusted = true;
    registerIpcHandlers(ipc, { completed: createCompletedStore(db) }, () => trusted);
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

  it("rejects calls from untrusted senders before touching the store", () => {
    trusted = false;
    expect(() => ipc.invoke(IPC_CHANNELS.completedSet, "CSC 1350", true)).toThrow(
      UntrustedIpcSenderError,
    );
    trusted = true;
    expect(ipc.invoke(IPC_CHANNELS.completedGet)).toEqual([]);
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
