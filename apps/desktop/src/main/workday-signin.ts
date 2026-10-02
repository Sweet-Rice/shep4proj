import { randomUUID } from "node:crypto";
import { BrowserWindow, session, type Session } from "electron";
import { WORKDAY_TENANT_URL } from "@jevschedule/workday/urls";

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
const APP_ROOT_FILTER = "https://www.myworkday.com/lsu/app-root*";

export type WorkdaySignInResult =
  | { status: "success"; session: Session }
  | { status: "cancelled" }
  | { status: "timeout" };

export interface WorkdaySignInOptions {
  timeoutMs?: number;
}

/** Opens an ephemeral Electron popup and closes it when this session completes app-root. */
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
    window.removeListener("closed", onClosed);
    ses.webRequest.onCompleted(null);
    if (close) {
      setImmediate(() => {
        if (!window.isDestroyed()) window.close();
      });
    }
    if (result.status !== "success") {
      await Promise.allSettled([
        Promise.resolve().then(() => ses.clearStorageData()),
        Promise.resolve().then(() => ses.clearCache()),
      ]);
    }
    resolveResult(result);
  };
  const onClosed = () => void finish({ status: "cancelled" }, false);
  const onRequestCompleted = (details: Electron.OnCompletedListenerDetails) => {
    if (details.statusCode === 200) void finish({ status: "success", session: ses }, true);
  };
  const timer = setTimeout(() => void finish({ status: "timeout" }, true), timeoutMs);

  window.once("closed", onClosed);
  ses.webRequest.onCompleted({ urls: [APP_ROOT_FILTER] }, onRequestCompleted);
  void window.loadURL(WORKDAY_TENANT_URL).catch(async (error: unknown) => {
    if (!settled) {
      settled = true;
      clearTimeout(timer);
      ses.webRequest.onCompleted(null);
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
