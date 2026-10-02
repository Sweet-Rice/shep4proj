import { BrowserWindow } from "electron";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

interface PopupMock {
  options: { webPreferences: { devTools: boolean; partition: string; preload?: string } };
  webContents: { emit: (event: string, ...args: unknown[]) => boolean };
  loadedUrls: string[];
  openHandler: (params: { url: string }) => unknown;
  close: Mock;
  destroy: Mock;
  setMenu: Mock;
  emit: (event: string, ...args: unknown[]) => boolean;
  isDestroyed: () => boolean;
  userClose: () => void;
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
  failLoads: boolean;
}

const testState = vi.hoisted(() => ({
  windows: [] as unknown[],
  sessions: [] as unknown[],
  rootResponses: [] as Array<unknown | Promise<unknown> | Error>,
  failLoads: false,
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
    readonly contents = Object.assign(new MockEmitter(), {
      setWindowOpenHandler: vi.fn((handler: (params: { url: string }) => unknown) => {
        this.openHandler = handler;
      }),
    });
    // Like Electron, a destroyed window's webContents can no longer be used.
    get webContents() {
      if (this.destroyed) throw new TypeError("Object has been destroyed");
      return this.contents;
    }
    /** The user closing the popup: Electron destroys the window, then emits "closed". */
    userClose() {
      this.destroyed = true;
      this.emit("closed");
    }
    destroyed = false;
    loadedUrls: string[] = [];
    loadURL = vi.fn(async (url: string) => {
      this.loadedUrls.push(url);
      if (testState.failLoads)
        throw new Error("ERR_ABORTED (-3) loading 'https://www.myworkday.com/lsu/'");
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
          fetch: vi.fn(async (_url: string, init?: { headers?: Record<string, string> }) => {
            const payload = testState.rootResponses.shift() ?? {};
            if (payload instanceof Error) throw payload;
            const value = await payload;
            // Live Workday serves its HTML page from app-root unless it's requested as JSON.
            if (init?.headers?.accept !== "application/json") {
              return {
                status: 200,
                json: async () => {
                  throw new SyntaxError(
                    "Unexpected token '<', \"<!DOCTYPE \"... is not valid JSON",
                  );
                },
              };
            }
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
  state().failLoads = false;
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
    const opened = openWorkdaySignIn({} as never);
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
    const opened = openWorkdaySignIn({} as never);
    const window = await waitForPopup();
    window.webContents.emit("did-navigate", {}, "https://www.myworkday.com/lsu/d/home.htmld");
    await new Promise<void>((resolve) => setImmediate(resolve));
    let settled = false;
    void opened.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    popup().userClose();
    await expect(opened).resolves.toEqual({ status: "cancelled" });
  });

  it("leaves the popup open when an app-root probe fails", async () => {
    state().rootResponses.push({}, new Error("network unavailable"));
    const { openWorkdaySignIn } = await import("./workday-signin.js");
    const opened = openWorkdaySignIn({} as never);
    const window = await waitForPopup();
    window.webContents.emit("did-navigate", {}, "https://www.myworkday.com/lsu/d/home.htmld");
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(popup().close).not.toHaveBeenCalled();
    popup().userClose();
    await expect(opened).resolves.toEqual({ status: "cancelled" });
  });

  it("allows at most one app-root probe in flight", async () => {
    let resolveProbe!: (value: unknown) => void;
    const pendingProbe = new Promise<unknown>((resolve) => {
      resolveProbe = resolve;
    });
    state().rootResponses.push({}, pendingProbe);
    const { openWorkdaySignIn } = await import("./workday-signin.js");
    const opened = openWorkdaySignIn({} as never);
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

  it("checks app-root again when a navigation arrives during a tokenless check", async () => {
    let resolveProbe!: (value: unknown) => void;
    const pendingProbe = new Promise<unknown>((resolve) => {
      resolveProbe = resolve;
    });
    state().rootResponses.push({}, pendingProbe, credentials);
    const { openWorkdaySignIn } = await import("./workday-signin.js");
    const opened = openWorkdaySignIn({} as never);
    const window = await waitForPopup();
    const ses = sessionMock();
    window.webContents.emit(
      "did-redirect-navigation",
      {},
      "https://www.myworkday.com/lsu/d/home.htmld",
      false,
      true,
    );
    await new Promise<void>((resolve) => setImmediate(resolve));
    // Login completes while the first check is still waiting on Workday.
    window.webContents.emit("did-navigate", {}, "https://www.myworkday.com/lsu/d/home.htmld");
    await new Promise<void>((resolve) => setImmediate(resolve));
    resolveProbe({});
    await expect(opened).resolves.toMatchObject({ status: "success", ...credentials });
    expect(ses.fetch).toHaveBeenCalledTimes(3);
  });

  it("reopens the popup when an app-run session no longer has credentials", async () => {
    state().rootResponses.push(credentials, {});
    const { openWorkdaySignIn } = await import("./workday-signin.js");
    await expect(openWorkdaySignIn({} as never)).resolves.toMatchObject({
      status: "success",
      ...credentials,
    });
    const nextImport = openWorkdaySignIn({} as never);
    const nextPopup = await waitForPopup();
    expect(state().windows).toHaveLength(1);
    expect(state().sessions).toHaveLength(1);
    nextPopup.userClose();
    await expect(nextImport).resolves.toEqual({ status: "cancelled" });
  });

  it("clears session cookies and cache when the app requests session teardown", async () => {
    state().rootResponses.push({});
    const { openWorkdaySignIn, clearWorkdaySession } = await import("./workday-signin.js");
    const pending = openWorkdaySignIn({} as never);
    const ses = sessionMock();
    const window = await waitForPopup();
    window.userClose();
    await expect(pending).resolves.toEqual({ status: "cancelled" });
    await clearWorkdaySession();
    expect(ses.clearStorageData).toHaveBeenCalledOnce();
    expect(ses.clearCache).toHaveBeenCalledOnce();
  });

  it("cancels when the user closes the popup without persisting a profile", async () => {
    const { openWorkdaySignIn } = await import("./workday-signin.js");
    const cancelled = openWorkdaySignIn({} as never);
    const firstPopup = await waitForPopup();
    expect(firstPopup.options.webPreferences.partition).not.toMatch(/^persist:/);
    firstPopup.userClose();
    await expect(cancelled).resolves.toEqual({ status: "cancelled" });
  });

  it("keeps the popup open through slow or failed loads until app-root returns a token", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "setInterval"] });
    state().failLoads = true;
    state().rootResponses.push({}, credentials);
    const { openWorkdaySignIn } = await import("./workday-signin.js");
    const opened = openWorkdaySignIn({} as never);
    let settled = false;
    void opened.then(() => {
      settled = true;
    });
    const window = await waitForPopup();
    expect(window.options.webPreferences.preload).toMatch(/workday-signin\.cjs$/);
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(settled).toBe(false);
    expect(window.close).not.toHaveBeenCalled();
    expect(window.destroy).not.toHaveBeenCalled();

    window.webContents.emit("did-navigate", {}, "https://www.myworkday.com/lsu/d/home.htmld");
    await new Promise<void>((resolve) => setImmediate(resolve));
    await expect(opened).resolves.toMatchObject({ status: "success", ...credentials });
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(window.close).toHaveBeenCalledOnce();
  });

  it("opens https SSO windows as locked children and closes them once signed in", async () => {
    state().rootResponses.push({}, credentials);
    const { openWorkdaySignIn } = await import("./workday-signin.js");
    const opened = openWorkdaySignIn({} as never);
    const window = await waitForPopup();

    expect(window.openHandler({ url: "http://login.example.com/mfa" })).toEqual({ action: "deny" });
    const allowed = window.openHandler({ url: "https://login.microsoftonline.com/mfa" }) as {
      action: string;
      overrideBrowserWindowOptions: { parent: unknown; webPreferences: Record<string, unknown> };
    };
    expect(allowed.action).toBe("allow");
    expect(allowed.overrideBrowserWindowOptions.parent).toBe(window);
    expect(allowed.overrideBrowserWindowOptions.webPreferences).toMatchObject({
      devTools: false,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    });
    // Children must be able to close themselves, so they don't get the close-blocking preload.
    expect(allowed.overrideBrowserWindowOptions.webPreferences.preload).toBeUndefined();

    const child = new BrowserWindow({}) as unknown as PopupMock;
    window.webContents.emit("did-create-window", child, {
      url: "https://login.microsoftonline.com/mfa",
    });
    expect(child.setMenu).toHaveBeenCalledWith(null);
    expect(child.openHandler({ url: "http://login.example.com/next" })).toEqual({
      action: "deny",
    });

    window.webContents.emit("did-navigate", {}, "https://www.myworkday.com/lsu/d/home.htmld");
    await new Promise<void>((resolve) => setImmediate(resolve));
    await expect(opened).resolves.toMatchObject({ status: "success", ...credentials });
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(child.close).toHaveBeenCalledOnce();
    expect(window.close).toHaveBeenCalledOnce();
  });
});
