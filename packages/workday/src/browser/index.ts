/**
 * Standalone Workday browser launch/teardown module (T-313, T-314, T-316).
 *
 * Not wired into `packages/workday/src/index.ts` yet — the Electron app
 * (T-017) will import from here directly once it exists.
 */
export { launchWorkdayBrowser } from "./launch.js";
export type { LaunchWorkdayBrowserOptions } from "./launch.js";
export { teardownWorkdayBrowser } from "./teardown.js";
export { DEFAULT_LOGGED_IN_PATTERN, WORKDAY_TENANT_URL, waitForWorkdayLogin } from "./login.js";
export type { WaitForWorkdayLoginOptions, WaitForWorkdayLoginResult } from "./login.js";
export {
  NoSupportedBrowserError,
  isBrowserNotInstalledError,
  isContextAlreadyClosedError,
} from "./errors.js";
export type {
  BrowserContextLike,
  BrowserContextLikeEvent,
  BrowserTypeLike,
  PageLike,
  PageLikeEvent,
  WorkdayBrowserChannel,
  WorkdayBrowserSession,
} from "./types.js";
