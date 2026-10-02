import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { BrowserWindow, session, type Session } from "electron";
import { guardedFetch } from "@jevschedule/workday/allowlist";
import { DEFAULT_LOGGED_IN_PATTERN, WORKDAY_TENANT_URL } from "@jevschedule/workday/urls";

const APP_ROOT_URL = "https://www.myworkday.com/lsu/app-root";
const SIGN_IN_WIDTH = 520;
const SIGN_IN_HEIGHT = 720;
// Keeps sign-in pages from closing the popup before the app has read the Workday session.
const SIGN_IN_PRELOAD = fileURLToPath(new URL("../preload/workday-signin.cjs", import.meta.url));

export interface WorkdaySessionCredentials {
  sessionSecureToken: string;
  uiClientVersion: string;
}

export type WorkdaySignInResult =
  ({ status: "success"; session: Session } & WorkdaySessionCredentials) | { status: "cancelled" };

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

/** No menu, devtools, context menu or non-https navigation; SSO may open locked child windows. */
function lockDown(window: BrowserWindow, children: Set<BrowserWindow>): void {
  window.setMenu(null);
  window.setMenuBarVisibility(false);
  window.webContents.on("context-menu", (event) => event.preventDefault());
  window.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith("https://")) event.preventDefault();
  });
  // Microsoft and Duo may run MFA in a window of their own, which closes itself when done.
  // Child windows share the popup's in-memory session but not its close-blocking preload.
  window.webContents.setWindowOpenHandler(({ url }) =>
    url.startsWith("https://")
      ? {
          action: "allow",
          overrideBrowserWindowOptions: {
            parent: window,
            width: SIGN_IN_WIDTH,
            height: SIGN_IN_HEIGHT,
            autoHideMenuBar: true,
            webPreferences: {
              nodeIntegration: false,
              contextIsolation: true,
              sandbox: true,
              devTools: false,
            },
          },
        }
      : { action: "deny" },
  );
  window.webContents.on("did-create-window", (child) => {
    children.add(child);
    child.once("closed", () => children.delete(child));
    lockDown(child, children);
  });
}

/**
 * Reuses the app-run session or opens a sign-in popup when app-root has no session token.
 * The popup closes only after app-root returns the session token, or when the user closes it.
 */
export async function openWorkdaySignIn(parent: BrowserWindow): Promise<WorkdaySignInResult> {
  const ses = getWorkdaySession();
  const existingCredentials = await readSessionCredentials(ses);
  if (existingCredentials) return { status: "success", session: ses, ...existingCredentials };

  const children = new Set<BrowserWindow>();
  const window = new BrowserWindow({
    parent,
    modal: true,
    width: SIGN_IN_WIDTH,
    height: SIGN_IN_HEIGHT,
    title: "Sign in to Workday",
    autoHideMenuBar: true,
    webPreferences: {
      partition: partition!,
      preload: SIGN_IN_PRELOAD,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      devTools: false,
    },
  });
  lockDown(window, children);

  let resolveResult!: (result: WorkdaySignInResult) => void;
  const promise = new Promise<WorkdaySignInResult>((resolve) => {
    resolveResult = resolve;
  });
  let settled = false;
  let probeInFlight: Promise<void> | undefined;
  const finish = (result: WorkdaySignInResult) => {
    if (settled) return;
    settled = true;
    // "closed" fires after the window is destroyed, when its webContents can no longer be used.
    if (!window.isDestroyed()) {
      window.webContents.removeListener("did-navigate", onNavigate);
      window.webContents.removeListener("did-redirect-navigation", onRedirect);
    }
    window.removeListener("closed", onClosed);
    // Deferred: closing inside a navigation callback can crash Electron.
    setImmediate(() => {
      for (const child of children) if (!child.isDestroyed()) child.close();
      if (!window.isDestroyed()) window.close();
    });
    resolveResult(result);
  };
  const probe = () => {
    if (settled || probeInFlight) return;
    probeInFlight = readSessionCredentials(ses)
      .then((credentials) => {
        if (credentials && !settled) finish({ status: "success", session: ses, ...credentials });
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
  const onClosed = () => finish({ status: "cancelled" });

  window.webContents.on("did-navigate", onNavigate);
  window.webContents.on("did-redirect-navigation", onRedirect);
  window.once("closed", onClosed);
  // A failed or superseded load leaves the popup open; Workday's redirects continue sign-in.
  void window.loadURL(WORKDAY_TENANT_URL).catch(() => undefined);
  return promise;
}
