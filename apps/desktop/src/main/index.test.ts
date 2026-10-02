import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ apiBaseUrl: undefined as string | undefined }));

vi.mock("electron", () => ({
  app: {
    getPath: () => "/user-data",
    on: vi.fn(),
    quit: vi.fn(),
    whenReady: () => Promise.resolve(),
  },
  BrowserWindow: class {
    static getAllWindows = vi.fn(() => [{}]);
    loadFile = vi.fn();
    loadURL = vi.fn();
  },
  dialog: { showOpenDialog: vi.fn() },
  ipcMain: {},
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
vi.mock("./store/plan.js", () => ({ createPlanStore: () => ({}) }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
  state.apiBaseUrl = undefined;
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
});
