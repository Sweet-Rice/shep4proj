import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  apiBaseUrl: undefined as string | undefined,
  windowOptions: undefined as Record<string, unknown> | undefined,
  appListeners: {} as Record<string, (event?: { preventDefault: () => void }) => void>,
  clearWorkdaySession: vi.fn(async () => undefined),
  quit: vi.fn(),
}));

vi.mock("electron", () => ({
  app: {
    getPath: () => "/user-data",
    on: vi.fn((event: string, listener: (arg?: { preventDefault: () => void }) => void) => {
      state.appListeners[event] = listener;
    }),
    quit: state.quit,
    whenReady: () => Promise.resolve(),
  },
  BrowserWindow: class {
    static getAllWindows = vi.fn(() => [{}]);
    loadFile = vi.fn();
    loadURL = vi.fn();

    constructor(options: Record<string, unknown>) {
      state.windowOptions = options;
    }
  },
  dialog: { showOpenDialog: vi.fn() },
  ipcMain: {},
  nativeTheme: { shouldUseDarkColors: false },
}));

vi.mock("./catalog.js", async (importOriginal) => {
  const actual = await importOriginal<{
    resolveApiBaseUrl: (runtime: string | undefined, buildTime: string | undefined) => string;
  }>();
  return {
    ...actual,
    createCatalogClient: (baseUrl: string) => {
      state.apiBaseUrl = baseUrl;
      return {};
    },
  };
});
vi.mock("./ipc.js", () => ({
  isAppRendererUrl: () => true,
  registerIpcHandlers: vi.fn(),
}));
vi.mock("./store/completed.js", () => ({ createCompletedStore: () => ({}) }));
vi.mock("./store/db.js", () => ({ openLocalDb: () => ({ close: vi.fn() }) }));
vi.mock("./store/academic-progress.js", () => ({
  createAcademicProgressStore: () => ({ getAudit: vi.fn(), saveAudit: vi.fn() }),
}));
vi.mock("./store/plan.js", () => ({ createPlanStore: () => ({}) }));
vi.mock("./workday-signin.js", () => ({
  clearWorkdaySession: state.clearWorkdaySession,
  openWorkdaySignIn: vi.fn(),
}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
  state.apiBaseUrl = undefined;
  state.windowOptions = undefined;
  state.appListeners = {};
  state.clearWorkdaySession.mockClear();
  state.quit.mockClear();
});

describe("main API URL wiring", () => {
  it("passes the runtime URL to the catalog client when a build-time URL is also set", async () => {
    vi.stubEnv("JEVSCHEDULE_API_URL", "https://runtime.example");
    vi.stubEnv("MAIN_VITE_API_URL", "https://build.example");

    // Load after stubbing env so the entrypoint evaluates its environment references.
    await import("./index.js");
    await vi.waitFor(() => expect(state.apiBaseUrl).toBeDefined());

    expect(state.apiBaseUrl).toBe("https://runtime.example");
  });
  // Importing the entrypoint runs Electron's ready handler and constructs BrowserWindow.
  it("creates a window sized for the desktop layouts", async () => {
    await import("./index.js");
    await vi.waitFor(() =>
      expect(state.windowOptions).toMatchObject({
        width: 1280,
        height: 820,
        minWidth: 1024,
        minHeight: 680,
        backgroundColor: "#F7F6FA",
      }),
    );
  });

  it("clears the in-memory Workday session before quitting", async () => {
    await import("./index.js");
    await vi.waitFor(() => expect(state.appListeners["before-quit"]).toBeDefined());
    const event = { preventDefault: vi.fn() };
    state.appListeners["before-quit"]?.(event);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(state.clearWorkdaySession).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(state.quit).toHaveBeenCalledOnce());
  });
});
