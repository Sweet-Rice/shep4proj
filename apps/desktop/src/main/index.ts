import { app, BrowserWindow, dialog, ipcMain, nativeTheme, type Session } from "electron";
import { readFile, stat } from "node:fs/promises";
import { parseTranscriptPdf } from "@jevschedule/workday";
import { guardedFetch } from "@jevschedule/workday/allowlist";
import { WorkdayShapeError } from "@jevschedule/workday/academic-record";
import { WorkdayAuthenticationError, createWorkdayImporter } from "./workday-import.js";
import { clearWorkdaySession, openWorkdaySignIn } from "./workday-signin.js";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createCatalogClient, resolveApiBaseUrl } from "./catalog.js";
import { isAppRendererUrl, registerIpcHandlers } from "./ipc.js";
import { createAcademicProgressStore } from "./store/academic-progress.js";
import { createCompletedStore } from "./store/completed.js";
import { openLocalDb } from "./store/db.js";
import { createPlanStore } from "./store/plan.js";
import { createLogger } from "./log/logger.js";

const rendererHtmlPath = fileURLToPath(new URL("../renderer/index.html", import.meta.url));
const rendererUrl = process.env.ELECTRON_RENDERER_URL ?? pathToFileURL(rendererHtmlPath).href;

let mainWindow: BrowserWindow | undefined;
let workdayCleanupPending = false;

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#141118" : "#F7F6FA",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // Sandboxed preloads can't be ES modules, so electron-vite builds this one as CommonJS.
      preload: fileURLToPath(new URL("../preload/index.cjs", import.meta.url)),
    },
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void window.loadFile(rendererHtmlPath);
  }
  return window;
}

void app.whenReady().then(() => {
  const db = openLocalDb(join(app.getPath("userData"), "jevschedule.sqlite"));
  app.on("will-quit", () => db.close());
  registerIpcHandlers(
    ipcMain,
    {
      completed: createCompletedStore(db),
      plan: createPlanStore(db),
      catalog: createCatalogClient(
        resolveApiBaseUrl(process.env.JEVSCHEDULE_API_URL, import.meta.env.MAIN_VITE_API_URL),
      ),
      academicProgress: createAcademicProgressStore(db),
    },
    (event) => isAppRendererUrl(event.senderFrame?.url, rendererUrl),
    async () => {
      const selection = await dialog.showOpenDialog({
        properties: ["openFile"],
        filters: [{ name: "PDF transcript", extensions: ["pdf"] }],
      });
      const path = selection.filePaths[0];
      if (selection.canceled || !path) return null;
      if ((await stat(path)).size > 20 * 1024 * 1024) {
        throw new Error("Transcript PDF exceeds the 20 MB limit");
      }
      return parseTranscriptPdf(await readFile(path));
    },
    {
      workday: createWorkdayImporter({
        signIn: () => {
          if (!mainWindow || mainWindow.isDestroyed())
            throw new Error("Application window is unavailable");
          return openWorkdaySignIn(mainWindow);
        },
        clearSession: clearWorkdaySession,
        fetchJson: async (ses: Session, url, headers) => {
          const response = await guardedFetch((input, init) => ses.fetch(input, init), {
            method: "GET",
            url,
            headers,
          });
          if (response.status === 401 || response.status === 403) {
            throw new WorkdayAuthenticationError();
          }
          if (response.status < 200 || response.status >= 300) {
            throw new WorkdayShapeError("Workday did not return the expected course records", url);
          }
          return response.json;
        },
        log: createLogger(),
      }),
    },
  );

  mainWindow = createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow();
  });
});

app.on("before-quit", (event) => {
  if (workdayCleanupPending) return;
  workdayCleanupPending = true;
  event.preventDefault();
  void clearWorkdaySession()
    .catch(() => undefined)
    .finally(() => app.quit());
});

app.on("window-all-closed", () => {
  void clearWorkdaySession().catch(() => app.quit());
  if (process.platform !== "darwin") app.quit();
});
