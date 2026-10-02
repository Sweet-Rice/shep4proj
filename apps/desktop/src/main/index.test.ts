import { afterEach, describe, expect, it, vi, type Mock } from "vitest";

const state = vi.hoisted(() => ({
  apiBaseUrl: undefined as string | undefined,
  watchApiBaseUrl: undefined as string | undefined,
  watchCount: 0,
  appHandlers: new Map<string, () => void>(),
  quit: vi.fn(),
  windows: [] as { show: Mock; focus: Mock; isDestroyed: Mock }[],
  buildFromTemplate: vi.fn((_template: unknown) => ({})),
}));

vi.mock("electron", () => ({
  app: {
    getPath: () => "/user-data",
    on: (event: string, handler: () => void) => state.appHandlers.set(event, handler),
    quit: state.quit,
    whenReady: () => Promise.resolve(),
  },
  BrowserWindow: class {
    loadFile = vi.fn();
    loadURL = vi.fn();
    on = vi.fn();
    show = vi.fn();
    focus = vi.fn();
    isDestroyed = vi.fn(() => false);
    constructor() {
      state.windows.push(this);
    }
  },
  dialog: { showOpenDialog: vi.fn() },
  ipcMain: {},
  Menu: { buildFromTemplate: state.buildFromTemplate },
  nativeImage: { createFromPath: () => ({ resize: () => ({}) }) },
  Notification: class {
    show = vi.fn();
  },
  Tray: class {
    destroy = vi.fn();
    on = vi.fn();
    setContextMenu = vi.fn();
    setToolTip = vi.fn();
  },
}));

vi.mock("../../resources/tray.png?asset", () => ({ default: "/resources/tray.png" }));
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
vi.mock("./store/plan.js", () => ({ createPlanStore: () => ({}) }));
vi.mock("./store/watches.js", () => ({
  createWatchStore: () => ({ list: () => Array.from({ length: state.watchCount }, () => ({})) }),
}));
vi.mock("./watch-checker.js", () => ({
  seatOpeningNotification: (watch: { courseCode: string; sectionNumber: string }) => ({
    title: `Seat open: ${watch.courseCode} ${watch.sectionNumber}`,
    body: "0 of 0 seats open. Seat counts update daily.",
  }),
  startWatchChecker: () => ({ stop: vi.fn() }),
}));
vi.mock("./watches.js", () => ({
  createWatchClient: (baseUrl: string) => {
    state.watchApiBaseUrl = baseUrl;
    return {};
  },
}));

const realPlatform = process.platform;

function setPlatform(platform: NodeJS.Platform): void {
  Object.defineProperty(process, "platform", { value: platform, configurable: true });
}

async function loadMain(): Promise<void> {
  // The entrypoint registers handlers on import, so each test loads a fresh copy. The
  // window-all-closed handler is the last registration made once the app is ready.
  await import("./index.js");
  await vi.waitFor(() => expect(state.appHandlers.has("window-all-closed")).toBe(true));
}

async function closeAllWindows(): Promise<void> {
  await loadMain();
  state.appHandlers.get("window-all-closed")!();
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
  setPlatform(realPlatform);
  state.apiBaseUrl = undefined;
  state.watchApiBaseUrl = undefined;
  state.watchCount = 0;
  state.appHandlers.clear();
  state.quit.mockClear();
  state.windows.length = 0;
  state.buildFromTemplate.mockClear();
});

describe("main API URL wiring", () => {
  it("passes the runtime URL to the catalog and watch clients when a build-time URL is also set", async () => {
    vi.stubEnv("JEVSCHEDULE_API_URL", "https://runtime.example");
    vi.stubEnv("MAIN_VITE_API_URL", "https://build.example");

    // Load after stubbing env so the entrypoint evaluates its environment references.
    await import("./index.js");
    await vi.waitFor(() => expect(state.apiBaseUrl).toBeDefined());

    expect(state.apiBaseUrl).toBe("https://runtime.example");
    expect(state.watchApiBaseUrl).toBe("https://runtime.example");
  });
});

describe("closing every window", () => {
  it("quits on Windows and Linux when no section is watched", async () => {
    setPlatform("win32");
    await closeAllWindows();
    expect(state.quit).toHaveBeenCalledTimes(1);
  });

  it("keeps running in the tray while a section is watched", async () => {
    setPlatform("win32");
    state.watchCount = 1;
    await closeAllWindows();
    expect(state.quit).not.toHaveBeenCalled();
  });

  it("keeps the macOS app running even when no section is watched", async () => {
    setPlatform("darwin");
    await closeAllWindows();
    expect(state.quit).not.toHaveBeenCalled();
  });
});
