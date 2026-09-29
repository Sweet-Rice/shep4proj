import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CATALOG_2026_2027, courseDetailUrl, courseListUrl } from "../catalog/urls.js";
import { createCatalogFetcher } from "./catalog-fetcher.js";

// The browser path runs against a scripted stand-in for playwright-core: no
// browser is launched and nothing touches the network. As in the plain-HTTP
// tests, each fetcher makes one request, so the crawl delay never sleeps.
const launch = vi.hoisted(() => vi.fn());
vi.mock("playwright-core", () => ({ chromium: { launch } }));

const LIST_URL = courseListUrl({ ...CATALOG_2026_2027, prefix: "CSC", page: 1 });

interface ScriptedResponse {
  status: number;
  body?: string;
  /** Defaults to the requested URL. */
  url?: string;
  /** Defaults to true; false is a subresource request. */
  navigation?: boolean;
  /** Defaults to true; false is a document in a subframe. */
  mainFrame?: boolean;
}

/**
 * A browser whose page answers `goto` by emitting `script` as its responses.
 * If none of them satisfies the pending `waitForResponse`, the wait times out,
 * as Playwright's does.
 */
function fakeBrowser(script: ScriptedResponse[]) {
  const events: string[] = [];
  const mainFrame = {};
  const otherFrame = {};
  const listeners: Array<(response: unknown) => void> = [];
  let pending:
    | {
        predicate: (response: unknown) => boolean;
        resolve: (response: unknown) => void;
        reject: (error: Error) => void;
      }
    | undefined;

  const page = {
    mainFrame: () => mainFrame,
    on: (event: string, listener: (response: unknown) => void) => {
      events.push(`on ${event}`);
      listeners.push(listener);
    },
    waitForResponse: (predicate: (response: unknown) => boolean) => {
      events.push("waitForResponse");
      return new Promise((resolve, reject) => {
        pending = { predicate, resolve, reject };
      });
    },
    goto: async (url: string, options: { waitUntil: string }) => {
      events.push(`goto ${url} ${options.waitUntil}`);
      await Promise.resolve();
      for (const step of script) {
        const response = {
          request: () => ({
            isNavigationRequest: () => step.navigation ?? true,
            frame: () => (step.mainFrame === false ? otherFrame : mainFrame),
          }),
          url: () => step.url ?? url,
          status: () => step.status,
          text: () => Promise.resolve(step.body ?? ""),
        };
        listeners.forEach((listener) => listener(response));
        if (pending?.predicate(response)) {
          pending.resolve(response);
          pending = undefined;
        }
      }
      if (pending !== undefined) {
        const timeout = new Error("Timeout 60000ms exceeded.");
        timeout.name = "TimeoutError";
        pending.reject(timeout);
      }
    },
    close: () => {
      events.push("page.close");
      return Promise.resolve();
    },
  };
  const browser = {
    newContext: () => Promise.resolve({ newPage: () => Promise.resolve(page) }),
    close: () => {
      events.push("browser.close");
      return Promise.resolve();
    },
  };
  launch.mockResolvedValue(browser);
  return { events };
}

beforeEach(() => {
  launch.mockReset();
  vi.stubEnv("CATALOG_BROWSER_CHANNEL", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("createCatalogFetcher browser path", () => {
  it("returns the 200 document that follows the WAF challenge's empty 202", async () => {
    const { events } = fakeBrowser([
      { status: 202, body: "" },
      { status: 200, body: "<html>course list</html>" },
    ]);
    const fetcher = createCatalogFetcher();

    await expect(fetcher.fetchHtml(LIST_URL)).resolves.toBe("<html>course list</html>");

    expect(events).toEqual([
      "on response",
      "waitForResponse",
      `goto ${LIST_URL} load`,
      "page.close",
    ]);
  });

  it("ignores subresources, subframe documents and other paths", async () => {
    fakeBrowser([
      { status: 200, body: "script", navigation: false },
      { status: 200, body: "ad frame", mainFrame: false },
      { status: 200, body: "other page", url: "https://catalog.lsu.edu/index.php" },
      { status: 200, body: "other host", url: "https://example.com/content.php" },
      { status: 200, body: "course list" },
    ]);
    const fetcher = createCatalogFetcher();

    await expect(fetcher.fetchHtml(LIST_URL)).resolves.toBe("course list");
  });

  it("reports the last status seen when the 200 never arrives, and closes the page", async () => {
    const { events } = fakeBrowser([{ status: 202 }, { status: 403 }]);
    const fetcher = createCatalogFetcher();

    await expect(fetcher.fetchHtml(LIST_URL)).rejects.toThrow(
      `catalog fetch failed: 403 ${LIST_URL}`,
    );
    expect(events.at(-1)).toBe("page.close");
  });

  it("reports a timeout when no response for the page was seen", async () => {
    fakeBrowser([]);
    const fetcher = createCatalogFetcher();

    await expect(fetcher.fetchHtml(LIST_URL)).rejects.toThrow(
      `catalog fetch failed: timeout ${LIST_URL}`,
    );
  });

  it("launches headless Chrome by default", async () => {
    fakeBrowser([{ status: 200 }]);
    const fetcher = createCatalogFetcher();

    await fetcher.fetchHtml(LIST_URL);

    expect(launch.mock.calls).toEqual([[{ channel: "chrome", headless: true }]]);
  });

  it("takes the channel from CATALOG_BROWSER_CHANNEL", async () => {
    vi.stubEnv("CATALOG_BROWSER_CHANNEL", "msedge");
    fakeBrowser([{ status: 200 }]);
    const fetcher = createCatalogFetcher();

    await fetcher.fetchHtml(LIST_URL);

    expect(launch.mock.calls).toEqual([[{ channel: "msedge", headless: true }]]);
  });

  it("lets the options override the environment", async () => {
    vi.stubEnv("CATALOG_BROWSER_CHANNEL", "msedge");
    fakeBrowser([{ status: 200 }]);
    const fetcher = createCatalogFetcher({ browserChannel: "chrome-beta", headless: false });

    await fetcher.fetchHtml(LIST_URL);

    expect(launch.mock.calls).toEqual([[{ channel: "chrome-beta", headless: false }]]);
  });

  it("closes the browser once, however many times close is called", async () => {
    const { events } = fakeBrowser([{ status: 200 }]);
    const fetcher = createCatalogFetcher();
    await fetcher.fetchHtml(LIST_URL);

    await fetcher.close();
    await fetcher.close();

    expect(events.filter((event) => event === "browser.close")).toHaveLength(1);
  });

  it("does not launch a browser for a course detail page", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(new Response("<html></html>", { status: 200 })),
    );
    const fetcher = createCatalogFetcher();

    await fetcher.fetchHtml(courseDetailUrl({ catoid: "35", coid: "232623" }));
    await fetcher.close();

    expect(launch).not.toHaveBeenCalled();
  });
});
