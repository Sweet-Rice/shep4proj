import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  Notification,
  Tray,
} from "electron";
import { readFile, stat } from "node:fs/promises";
import { parseTranscriptPdf } from "@jevschedule/workday";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createCatalogClient, resolveApiBaseUrl } from "./catalog.js";
import { isAppRendererUrl, registerIpcHandlers } from "./ipc.js";
import { createCompletedStore } from "./store/completed.js";
import { openLocalDb } from "./store/db.js";
import { createPlanStore } from "./store/plan.js";
import trayIconPath from "../../resources/tray.png?asset";
import { createWatchStore } from "./store/watches.js";
import { seatOpeningNotification, startWatchChecker } from "./watch-checker.js";
import { createWatchClient } from "./watches.js";

const rendererHtmlPath = fileURLToPath(new URL("../renderer/index.html", import.meta.url));
const rendererUrl = process.env.ELECTRON_RENDERER_URL ?? pathToFileURL(rendererHtmlPath).href;

let tray: Tray | undefined;
let mainWindow: BrowserWindow | undefined;

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 900,
    height: 650,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // Sandboxed preloads can't be ES modules, so electron-vite builds this one as CommonJS.
      preload: fileURLToPath(new URL("../preload/index.cjs", import.meta.url)),
    },
  });
  mainWindow = window;
  window.on("closed", () => {
    if (mainWindow === window) mainWindow = undefined;
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void window.loadFile(rendererHtmlPath);
  }
  return window;
}

function showWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
  } else {
    mainWindow.show();
    mainWindow.focus();
  }
}

void app.whenReady().then(() => {
  const db = openLocalDb(join(app.getPath("userData"), "jevschedule.sqlite"));
  const apiBaseUrl = resolveApiBaseUrl(
    process.env.JEVSCHEDULE_API_URL,
    import.meta.env.MAIN_VITE_API_URL,
  );
  const watchStore = createWatchStore(db);
  const watchChecker = startWatchChecker({
    store: watchStore,
    client: createWatchClient(apiBaseUrl),
    notify(watch) {
      new Notification(seatOpeningNotification(watch)).show();
    },
  });
  app.on("will-quit", () => {
    watchChecker.stop();
    tray?.destroy();
    db.close();
  });

  registerIpcHandlers(
    ipcMain,
    {
      completed: createCompletedStore(db),
      plan: createPlanStore(db),
      catalog: createCatalogClient(apiBaseUrl),
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
  );

  tray = new Tray(nativeImage.createFromPath(trayIconPath).resize({ width: 16, height: 16 }));
  tray.setToolTip("JevSchedule");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Open JevSchedule", click: showWindow },
      { type: "separator" },
      { label: "Quit", click: () => app.quit() },
    ]),
  );
  tray.on("double-click", showWindow);

  createWindow();

  app.on("activate", showWindow);
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin" && watchStore.list().length === 0) app.quit();
  });
});
