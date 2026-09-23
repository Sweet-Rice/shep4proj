import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_LOGGED_IN_PATTERN, waitForWorkdayLogin } from "./login.js";
import { FakeContext, FakePage } from "./test-support.js";

let page: FakePage;
let context: FakeContext;

beforeEach(() => {
  page = new FakePage();
  context = new FakeContext();
});

afterEach(() => {
  vi.useRealTimers();
});

function expectNoListeners(): void {
  expect(page.listenerCount("framenavigated")).toBe(0);
  expect(page.listenerCount("close")).toBe(0);
  expect(context.listenerCount("close")).toBe(0);
}

describe("waitForWorkdayLogin", () => {
  it("resolves success immediately when already on a logged-in page", async () => {
    page.emitNavigation("https://www.myworkday.com/lsu/d/home.htmld");

    const result = await waitForWorkdayLogin({ context, page });

    expect(result).toEqual({ status: "success" });
    expectNoListeners();
  });

  it("resolves success after an SSO redirect chain lands on a /lsu/d/ page", async () => {
    const promise = waitForWorkdayLogin({ context, page });

    page.emitNavigation("https://login.microsoftonline.com/common/oauth2/authorize?x=1");
    page.emitNavigation("https://www.myworkday.com/lsu/d/home.htmld");

    const result = await promise;

    expect(result).toEqual({ status: "success" });
    expectNoListeners();
  });

  it("matches any /lsu/d/ page, not only home", async () => {
    const promise = waitForWorkdayLogin({ context, page });

    page.emitNavigation("https://www.myworkday.com/lsu/d/task/2998$30300.htmld");

    const result = await promise;

    expect(result).toEqual({ status: "success" });
  });

  it("resolves cancelled with page-closed when the page closes before login", async () => {
    const promise = waitForWorkdayLogin({ context, page });

    page.emitNavigation("https://login.microsoftonline.com/common/oauth2/authorize");
    page.emitClose();

    const result = await promise;

    expect(result).toEqual({ status: "cancelled", reason: "page-closed" });
    expectNoListeners();
  });

  it("resolves cancelled with context-closed when the browser window closes", async () => {
    const promise = waitForWorkdayLogin({ context, page });

    context.emitClose();

    const result = await promise;

    expect(result).toEqual({ status: "cancelled", reason: "context-closed" });
    expectNoListeners();
  });

  it("resolves cancelled with aborted when the signal fires mid-wait", async () => {
    const controller = new AbortController();
    const promise = waitForWorkdayLogin({ context, page }, { signal: controller.signal });

    controller.abort();

    const result = await promise;

    expect(result).toEqual({ status: "cancelled", reason: "aborted" });
    expectNoListeners();
  });

  it("resolves cancelled with aborted immediately if the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    const result = await waitForWorkdayLogin({ context, page }, { signal: controller.signal });

    expect(result).toEqual({ status: "cancelled", reason: "aborted" });
    expectNoListeners();
  });

  it("resolves timeout when nothing happens within timeoutMs", async () => {
    vi.useFakeTimers();
    try {
      const promise = waitForWorkdayLogin({ context, page }, { timeoutMs: 1000 });

      await vi.advanceTimersByTimeAsync(1000);

      const result = await promise;

      expect(result).toEqual({ status: "timeout" });
      expectNoListeners();
    } finally {
      vi.useRealTimers();
    }
  });

  it("never resolves twice: a late navigation after timeout is a no-op", async () => {
    vi.useFakeTimers();
    try {
      const promise = waitForWorkdayLogin({ context, page }, { timeoutMs: 1000 });

      await vi.advanceTimersByTimeAsync(1000);
      const result = await promise;
      expect(result).toEqual({ status: "timeout" });

      // Listeners were already removed by cleanup, so this is inert; it
      // must not throw or otherwise change the settled result.
      expect(() => page.emitNavigation("https://www.myworkday.com/lsu/d/home.htmld")).not.toThrow();
    } finally {
      vi.useRealTimers();
    }
  });

  it("supports a custom loggedInPattern", async () => {
    const promise = waitForWorkdayLogin(
      { context, page },
      { loggedInPattern: /^https:\/\/example\.test\/app\// },
    );

    page.emitNavigation("https://example.test/app/home");

    const result = await promise;

    expect(result).toEqual({ status: "success" });
  });

  it("exports the expected default logged-in pattern", () => {
    expect(DEFAULT_LOGGED_IN_PATTERN.test("https://www.myworkday.com/lsu/d/home.htmld")).toBe(true);
    expect(
      DEFAULT_LOGGED_IN_PATTERN.test("https://www.myworkday.com/lsu/d/task/2998$30300.htmld"),
    ).toBe(true);
    expect(DEFAULT_LOGGED_IN_PATTERN.test("https://login.microsoftonline.com/common")).toBe(false);
    expect(DEFAULT_LOGGED_IN_PATTERN.test("https://www.myworkday.com/lsu/")).toBe(false);
  });
});
