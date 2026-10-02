import { randomUUID } from "node:crypto";
import { BrowserWindow, session, type Session } from "electron";
import { DEFAULT_LOGGED_IN_PATTERN, WORKDAY_TENANT_URL } from "@jevschedule/workday/urls";

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

export type WorkdaySignInResult =
  { status: "success"; session: Session } | { status: "cancelled" } | { status: "timeout" };

export interface WorkdaySignInOptions {
  timeoutMs?: number;
}

export async function openWorkdaySignIn(
  parent: BrowserWindow,
  { timeoutMs = DEFAULT_TIMEOUT_MS }: WorkdaySignInOptions = {},
): Promise<WorkdaySignInResult> {
  const partition = `wd-${randomUUID()}`;
  const ses = session.fromPartition(partition);
  const userAgent = ses
    .getUserAgent()
    .replace(/\s+Electron\/[^\s]+/g, "")
    .replace(/\s+JevSchedule\/[^\s]+/g, "");
  ses.setUserAgent(userAgent);

  let window: BrowserWindow;
  try {
    window = new BrowserWindow({
      parent,
      modal: true,
      width: 520,
      height: 720,
      title: "Sign in to Workday",
      autoHideMenuBar: true,
      webPreferences: {
        partition,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        devTools: false,
      },
    });
  } catch (error) {
    await Promise.allSettled([
      Promise.resolve().then(() => ses.clearStorageData()),
      Promise.resolve().then(() => ses.clearCache()),
    ]);
    throw error;
  }
  window.setMenu(null);
  window.setMenuBarVisibility(false);
  window.webContents.on("context-menu", (event) => event.preventDefault());
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) void window.loadURL(url).catch(() => undefined);
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith("https://")) event.preventDefault();
  });

  let resolveResult!: (result: WorkdaySignInResult) => void;
  let rejectResult!: (error: unknown) => void;
  const promise = new Promise<WorkdaySignInResult>((resolve, reject) => {
    resolveResult = resolve;
    rejectResult = reject;
  });
  let settled = false;
  const finish = async (result: WorkdaySignInResult, close: boolean) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    window.webContents.removeListener("did-navigate", onNavigate);
    window.webContents.removeListener("did-redirect-navigation", onRedirect);
    window.webContents.removeListener("did-navigate-in-page", onNavigateInPage);
    window.removeListener("closed", onClosed);
    if (close && !window.isDestroyed()) {
      window.webContents.stop();
      window.destroy();
    }
    if (result.status !== "success") {
      await Promise.allSettled([
        Promise.resolve().then(() => ses.clearStorageData()),
        Promise.resolve().then(() => ses.clearCache()),
      ]);
    }
    resolveResult(result);
  };
  const check = (url: string) => {
    if (DEFAULT_LOGGED_IN_PATTERN.test(url)) void finish({ status: "success", session: ses }, true);
  };
  const onNavigate = (_event: Electron.Event, url: string) => check(url);
  const onRedirect = (
    _event: Electron.Event,
    url: string,
    _isInPlace: boolean,
    isMainFrame: boolean,
  ) => {
    if (isMainFrame) check(url);
  };
  const onNavigateInPage = (_event: Electron.Event, url: string, isMainFrame: boolean) => {
    if (isMainFrame) check(url);
  };
  const onClosed = () => void finish({ status: "cancelled" }, false);
  const timer = setTimeout(() => void finish({ status: "timeout" }, true), timeoutMs);

  window.webContents.on("did-navigate", onNavigate);
  window.webContents.on("did-redirect-navigation", onRedirect);
  window.webContents.on("did-navigate-in-page", onNavigateInPage);
  window.once("closed", onClosed);
  void window.loadURL(WORKDAY_TENANT_URL).catch(async (error: unknown) => {
    if (!settled) {
      settled = true;
      clearTimeout(timer);
      window.destroy();
      await Promise.allSettled([
        Promise.resolve().then(() => ses.clearStorageData()),
        Promise.resolve().then(() => ses.clearCache()),
      ]);
      rejectResult(error);
    }
  });
  return promise;
}
