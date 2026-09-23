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
  | { status: "success"; page: PageLike }
  | { status: "cancelled"; reason: "page-closed" | "context-closed" | "aborted" }
  | { status: "timeout" };

/**
 * Waits for the student to finish the myLSU → Microsoft SSO/Duo → Workday
 * login flow, detected by the main-frame URL of any open page in `context`
 * matching `loggedInPattern` (default: any `/lsu/d/...` page).
 *
 * Microsoft SSO + Duo frequently swaps the page out from under us: Duo can
 * close the tab it started in and finish in a new one, or open the flow in a
 * popup and close the original tab once it's done. So rather than watching
 * only `session.page`, this watches the whole persistent `context` — every
 * currently-open page, plus any page opened later (`context.on("page", …)`)
 * — and checks each one's URL on navigation and as soon as it appears.
 *
 * Resolves — never rejects — with one of:
 * - `{ status: "success", page }` once some page's URL matches, naming which
 *   page is now logged in (it may not be `session.page`).
 * - `{ status: "cancelled", reason: "page-closed" }` only once every page in
 *   the context has closed — a single closed page (the SSO tab, a popup)
 *   with others still open just keeps the wait going.
 * - `{ status: "cancelled", reason: "context-closed" }` if the browser
 *   window itself is closed, or `"aborted"` if `signal` fires — before
 *   login completes.
 * - `{ status: "timeout" }` if none of the above happens within `timeoutMs`
 *   (default 5 minutes).
 *
 * Every listener and timer registered here — including on pages opened after
 * the wait started — is removed before resolving, on every path.
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
  const { context } = session;
  const signal = opts.signal;

  return new Promise<WaitForWorkdayLoginResult>((resolve) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const navListeners = new Map<PageLike, () => void>();
    const closeListeners = new Map<PageLike, () => void>();

    const onContextClosed = (): void => finish({ status: "cancelled", reason: "context-closed" });
    const onAbort = (): void => finish({ status: "cancelled", reason: "aborted" });
    const onNewPage = (newPage: PageLike): void => {
      watchPage(newPage);
      checkPage(newPage);
    };

    function watchPage(target: PageLike): void {
      if (navListeners.has(target)) {
        return;
      }
      const onNavigated = (): void => void checkPage(target);
      const onClosed = (): void => handlePageClosed(target);
      navListeners.set(target, onNavigated);
      closeListeners.set(target, onClosed);
      target.on("framenavigated", onNavigated);
      target.on("close", onClosed);
    }

    function unwatchPage(target: PageLike): void {
      const onNavigated = navListeners.get(target);
      const onClosed = closeListeners.get(target);
      if (onNavigated) {
        target.off("framenavigated", onNavigated);
      }
      if (onClosed) {
        target.off("close", onClosed);
      }
      navListeners.delete(target);
      closeListeners.delete(target);
    }

    function cleanup(): void {
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
      for (const target of [...navListeners.keys()]) {
        unwatchPage(target);
      }
      context.off("page", onNewPage);
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

    function handlePageClosed(target: PageLike): void {
      unwatchPage(target);
      let remaining: PageLike[];
      try {
        remaining = context.pages();
      } catch {
        remaining = [];
      }
      if (remaining.length === 0) {
        finish({ status: "cancelled", reason: "page-closed" });
      }
    }

    function checkPage(target: PageLike): boolean {
      let url: string;
      try {
        url = target.url();
      } catch {
        // Page may already be mid-teardown; a close event (if any) will
        // handle it instead.
        return false;
      }
      if (pattern.test(url)) {
        finish({ status: "success", page: target });
        return true;
      }
      return false;
    }

    function checkOpenPages(): void {
      let openPages: PageLike[];
      try {
        openPages = context.pages();
      } catch {
        return;
      }
      for (const target of openPages) {
        if (checkPage(target)) {
          return;
        }
      }
    }

    if (signal?.aborted) {
      finish({ status: "cancelled", reason: "aborted" });
      return;
    }

    context.on("page", onNewPage);
    context.on("close", onContextClosed);
    signal?.addEventListener("abort", onAbort);

    for (const target of context.pages()) {
      watchPage(target);
    }
    // Defensive: watch the caller-supplied page even if it's somehow not
    // (yet) reflected in `context.pages()`.
    watchPage(session.page);

    timer = setTimeout(() => finish({ status: "timeout" }), timeoutMs);

    // Handle the case where some open page is already logged in before this
    // function is called (e.g. a resumed/reused profile).
    checkOpenPages();
  });
}
