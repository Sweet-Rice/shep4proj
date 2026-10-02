import { afterEach, describe, expect, it, vi, type Mock } from "vitest";

const state = vi.hoisted(() => ({
  apiBaseUrl: undefined as string | undefined,
  watchApiBaseUrl: undefined as string | undefined,
  watchCount: 0,
  appHandlers: new Map<string, () => void>(),
  quit: vi.fn(),
  notifications: [] as { options: unknown; show: Mock }[],
  seatOpeningNotification: vi.fn((watch: { courseCode: string }) => ({
    title: `title for ${watch.courseCode}`,
    body: "body",
  })),
  startWatchChecker: vi.fn((_options: unknown) => ({ check: vi.fn(), stop: vi.fn() })),
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
    constructor(options: unknown) {
      state.notifications.push({ options, show: this.show });
    }
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
  seatOpeningNotification: state.seatOpeningNotification,
  startWatchChecker: state.startWatchChecker,
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
  state.notifications.length = 0;
  state.seatOpeningNotification.mockClear();
  state.startWatchChecker.mockClear();
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

describe("seat opening notifications", () => {
  it("starts one watch checker whose notify shows the seat-opening notification", async () => {
    await loadMain();

    expect(state.startWatchChecker).toHaveBeenCalledTimes(1);
    const options = state.startWatchChecker.mock.calls[0]![0] as {
      notify: (watch: unknown) => void;
    };
    expect(state.notifications).toHaveLength(0);

    const status = { courseCode: "CSC 4330" };
    options.notify(status);

    expect(state.seatOpeningNotification).toHaveBeenCalledWith(status);
    expect(state.notifications).toHaveLength(1);
    expect(state.notifications[0]!.options).toEqual({ title: "title for CSC 4330", body: "body" });
    expect(state.notifications[0]!.show).toHaveBeenCalledTimes(1);
  });
});

interface TrayMenuItem {
  label?: string;
  type?: string;
  click?: () => void;
}

async function loadTrayMenu(): Promise<TrayMenuItem[]> {
  await loadMain();
  expect(state.buildFromTemplate).toHaveBeenCalledTimes(1);
  return state.buildFromTemplate.mock.calls[0]![0] as TrayMenuItem[];
}

describe("tray menu", () => {
  it("offers Open JevSchedule and Quit", async () => {
    const template = await loadTrayMenu();
    expect(template.filter((item) => item.type !== "separator").map((item) => item.label)).toEqual([
      "Open JevSchedule",
      "Quit",
    ]);
  });

  it("quits the app from Quit", async () => {
    const template = await loadTrayMenu();
    template.find((item) => item.label === "Quit")!.click!();
    expect(state.quit).toHaveBeenCalledTimes(1);
  });

  it("shows and focuses the existing window from Open JevSchedule", async () => {
    const template = await loadTrayMenu();
    expect(state.windows).toHaveLength(1);
    template.find((item) => item.label === "Open JevSchedule")!.click!();
    expect(state.windows).toHaveLength(1);
    expect(state.windows[0]!.show).toHaveBeenCalledTimes(1);
    expect(state.windows[0]!.focus).toHaveBeenCalledTimes(1);
  });

  it("recreates the window from Open JevSchedule once it has been destroyed", async () => {
    const template = await loadTrayMenu();
    state.windows[0]!.isDestroyed.mockReturnValue(true);
    template.find((item) => item.label === "Open JevSchedule")!.click!();
    expect(state.windows).toHaveLength(2);
    expect(state.windows[0]!.show).not.toHaveBeenCalled();
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
