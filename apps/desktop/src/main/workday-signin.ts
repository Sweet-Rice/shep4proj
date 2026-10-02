import { randomUUID } from "node:crypto";
import { BrowserWindow, session, type Session } from "electron";
import { guardedFetch } from "@jevschedule/workday/allowlist";
import { DEFAULT_LOGGED_IN_PATTERN, WORKDAY_TENANT_URL } from "@jevschedule/workday/urls";

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
const APP_ROOT_URL = "https://www.myworkday.com/lsu/app-root";

export interface WorkdaySessionCredentials {
  sessionSecureToken: string;
  uiClientVersion: string;
}

export type WorkdaySignInResult =
  | ({ status: "success"; session: Session } & WorkdaySessionCredentials)
  | { status: "cancelled" }
  | { status: "timeout" };

export interface WorkdaySignInOptions {
  timeoutMs?: number;
}

let partition: string | undefined;
let workdaySession: Session | undefined;

function getWorkdaySession(): Session {
  if (!workdaySession) {
    partition ??= `wd-${randomUUID()}`;
    workdaySession = session.fromPartition(partition);
    const userAgent = workdaySession
      .getUserAgent()
      .replace(/\s+Electron\/[^\s]+/g, "")
      .replace(/\s+JevSchedule\/[^\s]+/g, "");
    workdaySession.setUserAgent(userAgent);
  }
  return workdaySession;
}

async function readSessionCredentials(ses: Session): Promise<WorkdaySessionCredentials | null> {
  try {
    const response = await guardedFetch((url, init) => ses.fetch(url, init), {
      method: "GET",
      url: APP_ROOT_URL,
    });
    if (response.status < 200 || response.status >= 300) return null;
    const payload = response.json;
    if (typeof payload !== "object" || payload === null) return null;
    if (!("sessionSecureToken" in payload) || !("uiClientVersion" in payload)) return null;
    const { sessionSecureToken, uiClientVersion } = payload;
    if (
      typeof sessionSecureToken !== "string" ||
      sessionSecureToken.trim().length === 0 ||
      typeof uiClientVersion !== "string" ||
      uiClientVersion.trim().length === 0
    ) {
      return null;
    }
    return { sessionSecureToken, uiClientVersion };
  } catch {
    return null;
  }
}

/** Clears the in-memory Workday session without writing credentials to disk. */
export async function clearWorkdaySession(): Promise<void> {
  if (!workdaySession) return;
  const results = await Promise.allSettled([
    Promise.resolve().then(() => workdaySession!.clearStorageData()),
    Promise.resolve().then(() => workdaySession!.clearCache()),
  ]);
  if (results.some((result) => result.status === "rejected")) {
    throw new Error("Unable to clear Workday session");
  }
}

/** Reuses the app-run session or opens a sign-in popup when app-root has no session token. */
export async function openWorkdaySignIn(
  parent: BrowserWindow,
  { timeoutMs = DEFAULT_TIMEOUT_MS }: WorkdaySignInOptions = {},
): Promise<WorkdaySignInResult> {
  const ses = getWorkdaySession();
  const existingCredentials = await readSessionCredentials(ses);
  if (existingCredentials) return { status: "success", session: ses, ...existingCredentials };

  const window = new BrowserWindow({
    parent,
    modal: true,
    width: 520,
    height: 720,
    title: "Sign in to Workday",
    autoHideMenuBar: true,
    webPreferences: {
      partition: partition!,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      devTools: false,
    },
  });

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
  let probeInFlight: Promise<void> | undefined;
  const finish = (result: WorkdaySignInResult, close: boolean) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    window.webContents.removeListener("did-navigate", onNavigate);
    window.webContents.removeListener("did-redirect-navigation", onRedirect);
    window.removeListener("closed", onClosed);
    if (close) {
      setImmediate(() => {
        if (!window.isDestroyed()) window.close();
      });
    }
    resolveResult(result);
  };
  const probe = () => {
    if (settled || probeInFlight) return;
    probeInFlight = readSessionCredentials(ses)
      .then((credentials) => {
        if (credentials && !settled) {
          finish({ status: "success", session: ses, ...credentials }, true);
        }
      })
      .finally(() => {
        probeInFlight = undefined;
      });
  };
  const queueProbe = (url: string, isMainFrame = true) => {
    if (isMainFrame && DEFAULT_LOGGED_IN_PATTERN.test(url)) setImmediate(probe);
  };
  const onNavigate = (_event: Electron.Event, url: string) => queueProbe(url);
  const onRedirect = (
    _event: Electron.Event,
    url: string,
    _isInPlace: boolean,
    isMainFrame: boolean,
  ) => queueProbe(url, isMainFrame);
  const onClosed = () => finish({ status: "cancelled" }, false);
  const timer = setTimeout(() => finish({ status: "timeout" }, true), timeoutMs);

  window.webContents.on("did-navigate", onNavigate);
  window.webContents.on("did-redirect-navigation", onRedirect);
  window.once("closed", onClosed);
  void window.loadURL(WORKDAY_TENANT_URL).catch((error: unknown) => {
    if (!settled) {
      settled = true;
      clearTimeout(timer);
      window.removeListener("closed", onClosed);
      if (!window.isDestroyed()) window.destroy();
      rejectResult(error);
    }
  });
  return promise;
}
