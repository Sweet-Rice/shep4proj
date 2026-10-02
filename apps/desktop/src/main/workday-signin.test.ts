import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

interface PopupMock {
  options: { webPreferences: { devTools: boolean; partition: string } };
  webContents: { emit: (event: string, ...args: unknown[]) => boolean };
  loadedUrls: string[];
  openHandler: (params: { url: string }) => unknown;
  close: Mock;
  destroy: Mock;
  emit: (event: string, ...args: unknown[]) => boolean;
}

interface SessionMock {
  partition: string;
  fetch: Mock;
  setUserAgent: Mock;
  getUserAgent: Mock;
  clearStorageData: Mock;
  clearCache: Mock;
}

interface TestState {
  windows: unknown[];
  sessions: unknown[];
  rootResponses: Array<unknown | Promise<unknown> | Error>;
}

const testState = vi.hoisted(() => ({
  windows: [] as unknown[],
  sessions: [] as unknown[],
  rootResponses: [] as Array<unknown | Promise<unknown> | Error>,
}));

vi.mock("electron", () => {
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
    });
    destroyed = false;
    loadedUrls: string[] = [];
    loadURL = vi.fn(async (url: string) => {
      this.loadedUrls.push(url);
    });
    setMenu = vi.fn();
    setMenuBarVisibility = vi.fn();
    isDestroyed = () => this.destroyed;
    close = vi.fn(() => {
      this.destroyed = true;
      this.emit("closed");
    });
    destroy = vi.fn(() => {
      this.destroyed = true;
      this.emit("closed");
    });
    constructor(options: unknown) {
      super();
      this.options = options;
      testState.windows.push(this);
    }
  }
  return {
    BrowserWindow: FakeWindow,
    session: {
      fromPartition: (partition: string) => {
        const ses: SessionMock = {
          partition,
          fetch: vi.fn(async () => {
            const payload = testState.rootResponses.shift() ?? {};
            if (payload instanceof Error) throw payload;
            const value = await payload;
            return { status: 200, json: async () => value };
          }),
          setUserAgent: vi.fn(),
          getUserAgent: vi.fn(() => "Mozilla/5.0 Electron/44 JevSchedule/1"),
          clearStorageData: vi.fn(async () => undefined),
          clearCache: vi.fn(async () => undefined),
        };
        testState.sessions.push(ses);
        return ses;
      },
    },
  };
});

function state(): TestState {
  return testState;
}

function popup(index = 0): PopupMock {
  return state().windows[index] as PopupMock;
}

function sessionMock(index = 0): SessionMock {
  return state().sessions[index] as SessionMock;
}

const credentials = {
  sessionSecureToken: "in-memory-token",
  uiClientVersion: "in-memory-version",
};

beforeEach(() => {
  vi.resetModules();

  vi.useRealTimers();
  state().windows.length = 0;
  state().sessions.length = 0;
  state().rootResponses.length = 0;
});

async function waitForPopup(index = 0): Promise<PopupMock> {
  for (let attempt = 0; attempt < 12 && state().windows.length <= index; attempt += 1) {
    await Promise.resolve();
  }
  if (state().windows.length <= index) throw new Error("Popup was not created");
  return popup(index);
}

describe("openWorkdaySignIn", () => {
  it("opens one secure popup and reuses its in-memory session after authenticated app-root", async () => {
    state().rootResponses.push({}, credentials, credentials);
    const { openWorkdaySignIn } = await import("./workday-signin.js");
    const opened = openWorkdaySignIn({} as never, { timeoutMs: 10_000 });
    const window = await waitForPopup();
    expect(window.options.webPreferences.devTools).toBe(false);
    expect(window.options.webPreferences.partition).toMatch(/^wd-/);
    expect(window.options.webPreferences.partition).not.toMatch(/^persist:/);
    expect(window.loadedUrls).toContain("https://www.myworkday.com/lsu/");
    window.webContents.emit("did-navigate", {}, "https://www.myworkday.com/lsu/d/home.htmld");
    await new Promise<void>((resolve) => setImmediate(resolve));
    await expect(opened).resolves.toMatchObject({ status: "success", ...credentials });
    expect(window.close).not.toHaveBeenCalled();
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(window.close).toHaveBeenCalledOnce();
    expect(window.destroy).not.toHaveBeenCalled();

    const again = await openWorkdaySignIn({} as never);
    expect(again).toMatchObject({ status: "success", ...credentials });
    expect(state().windows).toHaveLength(1);
    expect(state().sessions).toHaveLength(1);
  });

  it("does not resolve for a pre-login shell with an app-root response missing the token", async () => {
    state().rootResponses.push({}, { uiClientVersion: "version-without-token" });
    const { openWorkdaySignIn } = await import("./workday-signin.js");
    const opened = openWorkdaySignIn({} as never, { timeoutMs: 10_000 });
    const window = await waitForPopup();
    window.webContents.emit("did-navigate", {}, "https://www.myworkday.com/lsu/d/home.htmld");
    await new Promise<void>((resolve) => setImmediate(resolve));
    let settled = false;
    void opened.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    popup().emit("closed");
    await expect(opened).resolves.toEqual({ status: "cancelled" });
  });

  it("leaves the popup open when an app-root probe fails", async () => {
    state().rootResponses.push({}, new Error("network unavailable"));
    const { openWorkdaySignIn } = await import("./workday-signin.js");
    const opened = openWorkdaySignIn({} as never, { timeoutMs: 10_000 });
    const window = await waitForPopup();
    window.webContents.emit("did-navigate", {}, "https://www.myworkday.com/lsu/d/home.htmld");
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(popup().close).not.toHaveBeenCalled();
    popup().emit("closed");
    await expect(opened).resolves.toEqual({ status: "cancelled" });
  });

  it("allows at most one app-root probe in flight", async () => {
    let resolveProbe!: (value: unknown) => void;
    const pendingProbe = new Promise<unknown>((resolve) => {
      resolveProbe = resolve;
    });
    state().rootResponses.push({}, pendingProbe);
    const { openWorkdaySignIn } = await import("./workday-signin.js");
    const opened = openWorkdaySignIn({} as never, { timeoutMs: 10_000 });
    const window = await waitForPopup();
    const ses = sessionMock();
    window.webContents.emit("did-navigate", {}, "https://www.myworkday.com/lsu/d/home.htmld");
    await new Promise<void>((resolve) => setImmediate(resolve));
    window.webContents.emit(
      "did-redirect-navigation",
      {},
      "https://www.myworkday.com/lsu/d/home.htmld",
      false,
      true,
    );
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(ses.fetch).toHaveBeenCalledTimes(2);
    resolveProbe(credentials);
    await new Promise<void>((resolve) => setImmediate(resolve));
    await expect(opened).resolves.toMatchObject({ status: "success", ...credentials });
  });

  it("reopens the popup when an app-run session no longer has credentials", async () => {
    state().rootResponses.push(credentials, {});
    const { openWorkdaySignIn } = await import("./workday-signin.js");
    await expect(openWorkdaySignIn({} as never)).resolves.toMatchObject({
      status: "success",
      ...credentials,
    });
    const nextImport = openWorkdaySignIn({} as never, { timeoutMs: 10_000 });
    const nextPopup = await waitForPopup();
    expect(state().windows).toHaveLength(1);
    expect(state().sessions).toHaveLength(1);
    nextPopup.emit("closed");
    await expect(nextImport).resolves.toEqual({ status: "cancelled" });
  });

  it("clears session cookies and cache when the app requests session teardown", async () => {
    state().rootResponses.push({});
    const { openWorkdaySignIn, clearWorkdaySession } = await import("./workday-signin.js");
    const pending = openWorkdaySignIn({} as never, { timeoutMs: 10_000 });
    const ses = sessionMock();
    const window = await waitForPopup();
    window.emit("closed");
    await expect(pending).resolves.toEqual({ status: "cancelled" });
    await clearWorkdaySession();
    expect(ses.clearStorageData).toHaveBeenCalledOnce();
    expect(ses.clearCache).toHaveBeenCalledOnce();
  });

  it("cancels when the popup closes and times out without persisting a profile", async () => {
    const { openWorkdaySignIn } = await import("./workday-signin.js");
    const cancelled = openWorkdaySignIn({} as never, { timeoutMs: 10_000 });
    const firstPopup = await waitForPopup();
    expect(firstPopup.options.webPreferences.partition).not.toMatch(/^persist:/);
    firstPopup.emit("closed");
    await expect(cancelled).resolves.toEqual({ status: "cancelled" });

    vi.useFakeTimers();
    state().rootResponses.push({});
    const timedOut = openWorkdaySignIn({} as never, { timeoutMs: 20 });
    await vi.advanceTimersByTimeAsync(0);
    const timeoutPopup = await waitForPopup(1);
    await vi.advanceTimersByTimeAsync(20);
    await expect(timedOut).resolves.toEqual({ status: "timeout" });
    await vi.runAllTimersAsync();
    expect(timeoutPopup.close).toHaveBeenCalledOnce();
  });
});
