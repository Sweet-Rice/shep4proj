import type { BrowserContextLike, PageLike } from "./types.js";

/**
 * Workday tenant landing page for LSU. This is where `launchWorkdayBrowser`
 * points the first tab; the student then completes myLSU + Microsoft SSO +
 * Duo before landing back here, authenticated (T-002 survey).
 */
export const WORKDAY_TENANT_URL = "https://www.myworkday.com/lsu/";

/**
 * Authenticated Workday pages live under `/lsu/d/...` (e.g. `home.htmld`,
 * `task/<id>.htmld`, including the "View My Academic Record" task used by
 * US-10). Matching this prefix — rather than the home page specifically —
 * means we detect login regardless of which `/lsu/d/` page the student
 * lands on after SSO.
 */
export const DEFAULT_LOGGED_IN_PATTERN = /^https:\/\/www\.myworkday\.com\/lsu\/d\//;

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

export interface WaitForWorkdayLoginOptions {
  /** Overrides `DEFAULT_LOGGED_IN_PATTERN`, mainly for tests. */
  loggedInPattern?: RegExp;
  /** Overrides the default 5 minute timeout, mainly for tests. */
  timeoutMs?: number;
  /** Aborting resolves with `{ status: "cancelled", reason: "aborted" }`. */
  signal?: AbortSignal;
}

export type WaitForWorkdayLoginResult =
  | { status: "success" }
  | { status: "cancelled"; reason: "page-closed" | "context-closed" | "aborted" }
  | { status: "timeout" };

/**
 * Waits for the student to finish the myLSU → Microsoft SSO/Duo → Workday
 * login flow in `session.page`, detected by the main-frame URL matching
 * `loggedInPattern` (default: any `/lsu/d/...` page).
 *
 * Resolves — never rejects — with one of:
 * - `{ status: "success" }` once the URL matches after a navigation settles.
 * - `{ status: "cancelled", reason }` if the page or browser window is
 *   closed, or `signal` is aborted, before that happens.
 * - `{ status: "timeout" }` if none of the above happens within `timeoutMs`
 *   (default 5 minutes).
 *
 * Every listener and timer registered here is removed before resolving, on
 * every path.
 *
 * See SECURITY.md: this never logs the page URL or content, since the SSO
 * redirect chain can carry tokens in the query string or fragment.
 */
export function waitForWorkdayLogin(
  session: { context: BrowserContextLike; page: PageLike },
  opts: WaitForWorkdayLoginOptions = {},
): Promise<WaitForWorkdayLoginResult> {
  const pattern = opts.loggedInPattern ?? DEFAULT_LOGGED_IN_PATTERN;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const { context, page } = session;
  const signal = opts.signal;

  return new Promise<WaitForWorkdayLoginResult>((resolve) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const onNavigated = (): void => checkCurrentUrl();
    const onPageClosed = (): void => finish({ status: "cancelled", reason: "page-closed" });
    const onContextClosed = (): void => finish({ status: "cancelled", reason: "context-closed" });
    const onAbort = (): void => finish({ status: "cancelled", reason: "aborted" });

    function cleanup(): void {
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
      page.off("framenavigated", onNavigated);
      page.off("close", onPageClosed);
      context.off("close", onContextClosed);
      signal?.removeEventListener("abort", onAbort);
    }

    function finish(result: WaitForWorkdayLoginResult): void {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      resolve(result);
    }

    function checkCurrentUrl(): void {
      let url: string;
      try {
        url = page.url();
      } catch {
        // Page may already be mid-teardown; a close event (if any) will
        // resolve this promise instead.
        return;
      }
      if (pattern.test(url)) {
        finish({ status: "success" });
      }
    }

    if (signal?.aborted) {
      finish({ status: "cancelled", reason: "aborted" });
      return;
    }

    page.on("framenavigated", onNavigated);
    page.on("close", onPageClosed);
    context.on("close", onContextClosed);
    signal?.addEventListener("abort", onAbort);

    timer = setTimeout(() => finish({ status: "timeout" }), timeoutMs);

    // Handle the case where the session is already logged in before this
    // function is called (e.g. a resumed/reused profile).
    checkCurrentUrl();
  });
}
