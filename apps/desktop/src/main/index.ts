import { app, BrowserWindow, ipcMain } from "electron";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isAppRendererUrl, registerIpcHandlers } from "./ipc.js";
import { createCompletedStore } from "./store/completed.js";
import { openLocalDb } from "./store/db.js";

const rendererHtmlPath = fileURLToPath(new URL("../renderer/index.html", import.meta.url));
const rendererUrl = process.env.ELECTRON_RENDERER_URL ?? pathToFileURL(rendererHtmlPath).href;

function createWindow(): void {
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

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void window.loadFile(rendererHtmlPath);
  }
}

void app.whenReady().then(() => {
  const db = openLocalDb(join(app.getPath("userData"), "jevschedule.sqlite"));
  app.on("will-quit", () => db.close());

  registerIpcHandlers(ipcMain, { completed: createCompletedStore(db) }, (event) =>
    isAppRendererUrl(event.senderFrame?.url, rendererUrl),
  );

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
