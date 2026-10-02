import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ALLOWED_ENDPOINTS } from "@jevschedule/workday/allowlist";
import type { PageLike } from "@jevschedule/workday/browser";
import {
  createRequestHarvester,
  WorkdayHarvestTimeoutError,
  type HarvestTarget,
} from "./workday-harvest.js";

const ACADEMIC = ALLOWED_ENDPOINTS.find((item) => item.id === "academic-record-get")!;
const TARGET: HarvestTarget = {
  uiUrl: "https://www.myworkday.com/lsu/d/task/2998$30300.htmld",
  endpoint: ACADEMIC,
};
const ACADEMIC_URL =
  "https://www.myworkday.com/lsu/generic-hub/task/2998$30300.htmld?clientRequestID=a";
const CONTEXT_URL = "https://www.myworkday.com/lsu/generic-hub/page-context-id/ctx9.htmld";
const UI_HEADERS = {
  "session-secure-token": "synthetic-token",
  "x-workday-client": "synthetic-client",
  accept: "application/json",
  "content-type": "application/json",
  referer: TARGET.uiUrl,
  cookie: "synthetic-cookie",
  "user-agent": "synthetic-agent",
};

type RequestListener = (request: unknown) => void;

function fakePage(gotoResult: Promise<unknown> = Promise.resolve()) {
  const listeners = new Set<RequestListener>();
  const page = {
    goto: vi.fn(() => gotoResult),
    url: () => TARGET.uiUrl,
    on: vi.fn((event: string, listener: RequestListener) => {
      if (event === "request") listeners.add(listener);
    }),
    off: vi.fn((event: string, listener: RequestListener) => {
      if (event === "request") listeners.delete(listener);
    }),
  };
  function send(url: string, headers: Record<string, string> = UI_HEADERS, method = "GET"): void {
    for (const listener of listeners) {
      listener({ url: () => url, method: () => method, allHeaders: async () => headers });
    }
  }
  return { page: page as unknown as PageLike, goto: page.goto, listeners, send };
}

describe("createRequestHarvester", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns allowlisted UI requests with only the required header values", async () => {
    const fake = fakePage();
    const harvesting = createRequestHarvester({ settleMs: 100 })(fake.page, TARGET);
    expect(fake.goto).toHaveBeenCalledWith(TARGET.uiUrl);

    fake.send(TARGET.uiUrl);
    fake.send("https://www.myworkday.com/lsu/app-root");
    fake.send(ACADEMIC_URL, UI_HEADERS, "POST");
    fake.send(ACADEMIC_URL);
    fake.send(ACADEMIC_URL);
    fake.send(CONTEXT_URL);
    await vi.advanceTimersByTimeAsync(100);

    const candidates = await harvesting;
    expect(candidates).toEqual([
      {
        url: ACADEMIC_URL,
        headers: {
          "session-secure-token": "synthetic-token",
          "x-workday-client": "synthetic-client",
          accept: "application/json",
          "content-type": "application/json",
          referer: TARGET.uiUrl,
        },
      },
      expect.objectContaining({ url: CONTEXT_URL }),
    ]);
    expect(fake.listeners.size).toBe(0);
  });

  it("ignores allowlisted requests that carry no session token", async () => {
    const fake = fakePage();
    const harvesting = createRequestHarvester({ timeoutMs: 1_000 })(fake.page, TARGET);
    const { "session-secure-token": _token, ...withoutToken } = UI_HEADERS;
    fake.send(ACADEMIC_URL, withoutToken);
    const rejected = expect(harvesting).rejects.toBeInstanceOf(WorkdayHarvestTimeoutError);
    await vi.advanceTimersByTimeAsync(1_000);

    await rejected;
    expect(fake.listeners.size).toBe(0);
  });

  it("stops observing once the candidate limit is reached", async () => {
    const fake = fakePage();
    const harvesting = createRequestHarvester({ maxCandidates: 1 })(fake.page, TARGET);
    fake.send(ACADEMIC_URL);

    await expect(harvesting).resolves.toHaveLength(1);
    expect(fake.listeners.size).toBe(0);
  });

  it("rejects without the page error when the UI page cannot be opened", async () => {
    const fake = fakePage(Promise.reject(new Error("net::ERR at https://secret.example/?t=1")));
    const harvesting = createRequestHarvester()(fake.page, TARGET);

    await expect(harvesting).rejects.toThrow("Workday page could not be opened");
    expect(fake.listeners.size).toBe(0);
  });
});
