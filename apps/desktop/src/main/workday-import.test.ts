import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import {
  ALLOWED_ENDPOINTS,
  guardedFetch,
  type FetchImplementation,
  type GuardedRequest,
} from "@jevschedule/workday/allowlist";
import { WorkdayAuthenticationError } from "./workday-import.js";
import { WorkdayShapeError } from "@jevschedule/workday/academic-record";
import type { WorkdayImportProgress } from "../shared/ipc.js";
import { createWorkdayImporter } from "./workday-import.js";

const FIXTURES_DIR = fileURLToPath(new URL("../../../../fixtures/workday/", import.meta.url));
const academicRecord = JSON.parse(
  readFileSync(`${FIXTURES_DIR}academic-record.synthetic.json`, "utf8"),
) as unknown;
const registrations = JSON.parse(
  readFileSync(`${FIXTURES_DIR}current-registrations.synthetic.json`, "utf8"),
) as unknown;
const progress = JSON.parse(
  readFileSync(`${FIXTURES_DIR}academic-progress.synthetic.json`, "utf8"),
) as unknown;
const ACADEMIC = "https://www.myworkday.com/lsu/generic-hub/task/2998$30300.htmld";
const COURSES = "https://www.myworkday.com/lsu/generic-hub/task/2998$28771.htmld";
const PROGRESS = "https://www.myworkday.com/lsu/generic-hub/task/2998$43459.htmld";
const TOKEN = "synthetic-secure-token-7f3a";
const VERSION = "synthetic-client-version";
const HOME = "https://www.myworkday.com/lsu/d/home.htmld";
const DATA_HEADERS = {
  "session-secure-token": TOKEN,
  "x-workday-client": VERSION,
  accept: "application/json",
  referer: HOME,
};
const session = {
  clearStorageData: vi.fn(async () => undefined),
  clearCache: vi.fn(async () => undefined),
} as never;

interface HarnessOptions {
  responses?: Record<string, unknown>;
  failUrl?: string;
  unauthorizedUrl?: string;
  throwFetch?: boolean;
}

function harness(options: HarnessOptions = {}) {
  const events: string[] = [];
  const messages: WorkdayImportProgress[] = [];
  const logCalls: unknown[][] = [];
  const requests: Array<{ url: string; headers?: Readonly<Record<string, string>> }> = [];
  const payloads: Record<string, unknown> = {
    [ACADEMIC]: options.responses?.[ACADEMIC] ?? academicRecord,
    [COURSES]: options.responses?.[COURSES] ?? registrations,
    [PROGRESS]: options.responses?.[PROGRESS] ?? progress,
  };
  let unauthorizedOnce = true;
  const fetch = vi.fn<FetchImplementation>(async (url: string) => {
    events.push(`fetch ${url}`);
    if (options.throwFetch) throw new Error("sensitive response body");
    if (url === options.unauthorizedUrl && unauthorizedOnce) {
      unauthorizedOnce = false;
      return { status: 401, json: async () => null };
    }
    if (url === options.failUrl) return { status: 503, json: async () => null };
    return { status: 200, json: async () => payloads[url] ?? null };
  });
  const fetchJson = vi.fn(
    async (_ses: never, url: string, headers?: Readonly<Record<string, string>>) => {
      const request: GuardedRequest = { method: "GET", url, headers };
      requests.push({ url, headers });
      const result = await guardedFetch(fetch, request, ALLOWED_ENDPOINTS);
      if (result.status === 401 || result.status === 403) throw new WorkdayAuthenticationError();
      if (result.status < 200 || result.status >= 300) {
        throw new WorkdayShapeError("Workday did not return the expected course records", url);
      }
      return result.json;
    },
  );
  const log = Object.fromEntries(
    ["debug", "info", "warn", "error"].map((level) => [
      level,
      (...args: unknown[]) => logCalls.push(args),
    ]),
  ) as never;
  const clearStorageData = vi.fn(async () => undefined);
  const clearCache = vi.fn(async () => undefined);
  const clearSession = vi.fn(async () => undefined);
  const signIn = vi.fn(async () => {
    events.push("sign-in");
    return {
      status: "success" as const,
      session: { clearStorageData, clearCache } as never,
      sessionSecureToken: TOKEN,
      uiClientVersion: VERSION,
    };
  });
  const importer = createWorkdayImporter({
    signIn,
    clearSession,
    fetchJson: fetchJson as never,
    log,
  });
  const run = () => importer.run((progress) => messages.push(progress));
  return {
    run,
    events,
    messages,
    logCalls,
    fetch,
    fetchJson,
    requests,
    signIn,
    clearSession,
    clearStorageData,
    clearCache,
  };
}

describe("createWorkdayImporter", () => {
  it("uses popup-provided session headers for allowlisted reads without fetching app-root again", async () => {
    const h = harness();
    const review = await h.run();
    expect(h.events).toEqual([
      "sign-in",
      `fetch ${ACADEMIC}`,
      `fetch ${COURSES}`,
      `fetch ${PROGRESS}`,
    ]);
    expect(h.requests).toEqual([
      { url: ACADEMIC, headers: DATA_HEADERS },
      { url: COURSES, headers: DATA_HEADERS },
      { url: PROGRESS, headers: DATA_HEADERS },
    ]);
    expect(review.completed).toContain("CSC 1350");
    expect(review.inProgress.flatMap((term) => term.courses)).toContain("CSC 4330");
    expect(review.academicProgress?.overall.definedCredits).toBe(120);
    expect(h.messages.map(({ stage }) => stage)).toEqual(["signing-in", "fetching", "review"]);
    expect(h.clearStorageData).not.toHaveBeenCalled();
    expect(h.clearCache).not.toHaveBeenCalled();
  });

  it("returns the course review when academic-progress retrieval fails", async () => {
    const h = harness({ failUrl: PROGRESS });
    const review = await h.run();
    expect(review.completed).toContain("CSC 1350");
    expect(review.academicProgress).toBeNull();
    expect(h.messages.at(-1)).toEqual({ stage: "review" });
    expect(h.logCalls).toContainEqual(["workday import", "academic-progress-unavailable"]);
  });

  it("clears expired authentication and retries the import after one fresh sign-in", async () => {
    const h = harness({ unauthorizedUrl: ACADEMIC });
    const review = await h.run();
    expect(review.completed).toContain("CSC 1350");
    expect(h.signIn).toHaveBeenCalledTimes(2);
    expect(h.clearSession).toHaveBeenCalledOnce();
    expect(h.fetchJson.mock.calls.map(([, url]) => url)).toEqual([
      ACADEMIC,
      ACADEMIC,
      COURSES,
      PROGRESS,
    ]);
    expect(h.messages.map(({ stage }) => stage)).toEqual([
      "signing-in",
      "fetching",
      "signing-in",
      "fetching",
      "review",
    ]);
  });

  it("never fetches a non-allowlisted URL", async () => {
    const h = harness();
    await expect(
      h.fetchJson(session, "https://www.myworkday.com/lsu/private-profile"),
    ).rejects.toThrow();
    expect(h.fetch).not.toHaveBeenCalled();
  });

  it("offers the transcript fallback when a direct data endpoint returns non-2xx", async () => {
    const h = harness({ failUrl: ACADEMIC });
    await expect(h.run()).rejects.toBeInstanceOf(WorkdayShapeError);
    expect(h.messages.at(-1)).toMatchObject({ stage: "error", fallback: "upload" });
    expect(h.fetchJson.mock.calls.map(([, url]) => url)).toEqual([ACADEMIC]);
  });

  it("uses the transcript PDF fallback when a data shape changes", async () => {
    const h = harness({ responses: { [ACADEMIC]: { body: {} } } });
    await expect(h.run()).rejects.toBeInstanceOf(WorkdayShapeError);
    expect(h.messages.at(-1)).toEqual({
      stage: "error",
      fallback: "upload",
      message: "Workday's pages changed. Import your transcript PDF instead.",
    });
  });

  it("keeps session values and response data out of output", async () => {
    const h = harness({ throwFetch: true });
    await expect(h.run()).rejects.toThrow("sensitive response body");
    const exported = JSON.stringify([h.messages, h.logCalls]);
    expect(exported).not.toContain(TOKEN);
    expect(exported).not.toContain(VERSION);
    expect(exported).not.toContain("private sentinel");
  });

  it("retains an authenticated session after a successful review for the next import", async () => {
    const h = harness();
    const review = await h.run();
    expect(review.completed.length).toBeGreaterThan(0);
    expect(h.clearSession).not.toHaveBeenCalled();
  });
});
