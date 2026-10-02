import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

interface PopupMock {
  options: { webPreferences: { devTools: boolean; partition: string } };
  webContents: { emit: (event: string, ...args: unknown[]) => boolean; stop: Mock };
  loadedUrls: string[];
  openHandler: (params: { url: string }) => unknown;
  destroy: Mock;
  emit: (event: string, ...args: unknown[]) => boolean;
}

interface SessionMock {
  partition: string;
  setUserAgent: Mock;
  clearStorageData: Mock;
  clearCache: Mock;
}

interface TestState {
  windows: unknown[];
  sessions: unknown[];
}

type TestGlobal = typeof globalThis & { __workdaySignInState?: TestState };

vi.mock("electron", () => {
  const state: TestState = { windows: [], sessions: [] };
  (globalThis as TestGlobal).__workdaySignInState = state;
  class MockEmitter {
    private readonly listeners = new Map<string, Array<(...args: unknown[]) => void>>();
    on(event: string, listener: (...args: unknown[]) => void) {
      const listeners = this.listeners.get(event) ?? [];
      listeners.push(listener);
      this.listeners.set(event, listeners);
      return this;
    }
    once(event: string, listener: (...args: unknown[]) => void) {
      const onceListener = (...args: unknown[]) => {
        this.removeListener(event, onceListener);
        listener(...args);
      };
      return this.on(event, onceListener);
    }
    removeListener(event: string, listener: (...args: unknown[]) => void) {
      this.listeners.set(
        event,
        (this.listeners.get(event) ?? []).filter((entry) => entry !== listener),
      );
      return this;
    }
    emit(event: string, ...args: unknown[]) {
      for (const listener of this.listeners.get(event) ?? []) listener(...args);
      return true;
    }
  }
  class FakeWindow extends MockEmitter {
    options: unknown;
    openHandler: (params: { url: string }) => unknown = () => undefined;
    webContents = Object.assign(new MockEmitter(), {
      setWindowOpenHandler: vi.fn((handler: (params: { url: string }) => unknown) => {
        this.openHandler = handler;
      }),
      stop: vi.fn(),
    });
    destroyed = false;
    loadedUrls: string[] = [];
    loadURL = vi.fn(async (url: string) => {
      this.loadedUrls.push(url);
    });
    setMenu = vi.fn();
    setMenuBarVisibility = vi.fn();
    isDestroyed = () => this.destroyed;
    destroy = vi.fn(() => {
      this.destroyed = true;
      this.emit("closed");
    });
    constructor(options: unknown) {
      super();
      this.options = options;
      state.windows.push(this);
    }
  }
  return {
    BrowserWindow: FakeWindow,
    session: {
      fromPartition: vi.fn((partition: string) => {
        const ses = {
          partition,
          getUserAgent: () => "Mozilla/5.0 Chrome/140.0 Electron/44.4.5 JevSchedule/1.1.0",
          setUserAgent: vi.fn(),
          clearStorageData: vi.fn(async () => undefined),
          clearCache: vi.fn(async () => undefined),
        };
        state.sessions.push(ses);
        return ses;
      }),
    },
  };
});

function state(): TestState {
  return (globalThis as TestGlobal).__workdaySignInState!;
}

function popup(index = 0): PopupMock {
  return state().windows[index] as PopupMock;
}

function sessionMock(index = 0): SessionMock {
  return state().sessions[index] as SessionMock;
}

import { openWorkdaySignIn } from "./workday-signin.js";

beforeEach(() => {
  state().windows.length = 0;
  state().sessions.length = 0;
  vi.useRealTimers();
});

describe("openWorkdaySignIn", () => {
  it("opens HTTPS popup requests in the same window and denies new windows", async () => {
    const opened = openWorkdaySignIn({} as never, { timeoutMs: 10_000 });
    const window = popup();
    const response = window.openHandler({ url: "https://login.microsoftonline.com/" });
    expect(response).toEqual({ action: "deny" });
    expect(window.loadedUrls).toContain("https://login.microsoftonline.com/");
    expect(state().windows).toHaveLength(1);
    window.emit("closed");
    await expect(opened).resolves.toEqual({ status: "cancelled" });
  });

  it("closes immediately on the first signed-in navigation and resolves with its session", async () => {
    const opened = openWorkdaySignIn({} as never, { timeoutMs: 10_000 });
    const window = popup();
    const ses = sessionMock();
    window.webContents.emit("did-navigate", {}, "https://www.myworkday.com/lsu/d/home.htmld");
    await expect(opened).resolves.toEqual({ status: "success", session: ses });
    expect(window.webContents.stop).toHaveBeenCalledOnce();
    expect(window.destroy).toHaveBeenCalledOnce();
  });

  it("cancels when the user closes the window and clears the ephemeral session", async () => {
    const opened = openWorkdaySignIn({} as never, { timeoutMs: 10_000 });
    popup().emit("closed");
    await expect(opened).resolves.toEqual({ status: "cancelled" });
    expect(sessionMock().clearStorageData).toHaveBeenCalledOnce();
    expect(sessionMock().clearCache).toHaveBeenCalledOnce();
  });

  it("times out, closes the window, and clears the ephemeral session", async () => {
    vi.useFakeTimers();
    const opened = openWorkdaySignIn({} as never, { timeoutMs: 20 });
    await vi.advanceTimersByTimeAsync(20);
    await expect(opened).resolves.toEqual({ status: "timeout" });
    expect(popup().destroy).toHaveBeenCalledOnce();
    expect(sessionMock().clearStorageData).toHaveBeenCalledOnce();
    expect(sessionMock().clearCache).toHaveBeenCalledOnce();
  });

  it("uses a unique in-memory partition, disables tools and removes Electron from the user agent", async () => {
    const first = openWorkdaySignIn({} as never, { timeoutMs: 10_000 });
    const second = openWorkdaySignIn({} as never, { timeoutMs: 10_000 });
    expect(popup(0).options.webPreferences.devTools).toBe(false);
    expect(popup(0).options.webPreferences.partition).toMatch(/^wd-/);
    expect(popup(0).options.webPreferences.partition).not.toMatch(/^persist:/);
    expect(popup(0).options.webPreferences.partition).not.toBe(
      popup(1).options.webPreferences.partition,
    );
    expect(sessionMock().setUserAgent).toHaveBeenCalledWith(
      expect.not.stringContaining("Electron/"),
    );
    popup(0).emit("closed");
    popup(1).emit("closed");
    await Promise.all([first, second]);
  });
});
