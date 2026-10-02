import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import {
  ALLOWED_ENDPOINTS,
  guardedFetch,
  type FetchImplementation,
  type GuardedRequest,
} from "@jevschedule/workday/allowlist";
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
const APP_ROOT = "https://www.myworkday.com/lsu/app-root";
const ACADEMIC = "https://www.myworkday.com/lsu/generic-hub/task/2998$30300.htmld";
const COURSES = "https://www.myworkday.com/lsu/generic-hub/task/2998$28771.htmld";
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
  throwFetch?: boolean;
  missingToken?: boolean;
  cleanupError?: boolean;
}

function harness(options: HarnessOptions = {}) {
  const events: string[] = [];
  const messages: WorkdayImportProgress[] = [];
  const logCalls: unknown[][] = [];
  const requests: Array<{ url: string; headers?: Readonly<Record<string, string>> }> = [];
  const payloads: Record<string, unknown> = {
    [APP_ROOT]: options.missingToken
      ? { uiClientVersion: VERSION, userModel: { private: "private sentinel" } }
      : {
          sessionSecureToken: TOKEN,
          uiClientVersion: VERSION,
          userModel: { private: "private sentinel" },
        },
    [ACADEMIC]: options.responses?.[ACADEMIC] ?? academicRecord,
    [COURSES]: options.responses?.[COURSES] ?? registrations,
  };
  const fetch = vi.fn<FetchImplementation>(async (url: string) => {
    events.push(`fetch ${url}`);
    if (options.throwFetch) throw new Error("sensitive response body");
    if (url === options.failUrl) return { status: 503, json: async () => null };
    return { status: 200, json: async () => payloads[url] ?? null };
  });
  const fetchJson = vi.fn(
    async (_ses: never, url: string, headers?: Readonly<Record<string, string>>) => {
      const request: GuardedRequest = { method: "GET", url, headers };
      requests.push({ url, headers });
      const result = await guardedFetch(fetch, request, ALLOWED_ENDPOINTS);
      if (result.status < 200 || result.status >= 300) {
        if (url === APP_ROOT) throw new Error("Workday could not provide session headers");
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
  const clearStorageData = vi.fn(async () => {
    if (options.cleanupError) throw new Error("cleanup details");
  });
  const clearCache = vi.fn(async () => undefined);
  const importer = createWorkdayImporter({
    signIn: vi.fn(async () => {
      events.push("sign-in");
      return { status: "success" as const, session: { clearStorageData, clearCache } as never };
    }),
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
    clearStorageData,
    clearCache,
  };
}

describe("createWorkdayImporter", () => {
  it("fetches app-root first and passes only its two session values to allowlisted data reads", async () => {
    const h = harness();
    const review = await h.run();
    expect(h.events).toEqual([
      "sign-in",
      `fetch ${APP_ROOT}`,
      `fetch ${ACADEMIC}`,
      `fetch ${COURSES}`,
    ]);
    expect(h.requests).toEqual([
      { url: APP_ROOT, headers: undefined },
      { url: ACADEMIC, headers: DATA_HEADERS },
      { url: COURSES, headers: DATA_HEADERS },
    ]);
    expect(h.fetchJson.mock.calls.map(([, url]) => url)).toEqual([APP_ROOT, ACADEMIC, COURSES]);
    expect(review.completed).toContain("CSC 1350");
    expect(review.inProgress.flatMap((term) => term.courses)).toContain("CSC 4330");
    expect(h.messages.map(({ stage }) => stage)).toEqual(["signing-in", "fetching", "review"]);
    expect(h.clearStorageData).toHaveBeenCalledOnce();
    expect(h.clearCache).toHaveBeenCalledOnce();
  });

  it("never fetches a non-allowlisted URL", async () => {
    const h = harness();
    await expect(
      h.fetchJson(session, "https://www.myworkday.com/lsu/private-profile"),
    ).rejects.toThrow();
    expect(h.fetch).not.toHaveBeenCalled();
  });

  it("emits an error when app-root does not include the session token", async () => {
    const h = harness({ missingToken: true });
    await expect(h.run()).rejects.toThrow("Workday session headers are unavailable");
    expect(h.messages.at(-1)).toEqual({
      stage: "error",
      message: "Could not import records from Workday.",
    });
    expect(h.fetchJson).toHaveBeenCalledOnce();
    expect(h.clearStorageData).toHaveBeenCalledOnce();
  });

  it("offers the transcript fallback when a direct data endpoint returns non-2xx", async () => {
    const h = harness({ failUrl: ACADEMIC });
    await expect(h.run()).rejects.toBeInstanceOf(WorkdayShapeError);
    expect(h.messages.at(-1)).toMatchObject({ stage: "error", fallback: "upload" });
    expect(h.fetchJson.mock.calls.map(([, url]) => url)).toEqual([APP_ROOT, ACADEMIC]);
    expect(h.clearStorageData).toHaveBeenCalledOnce();
  });

  it("uses the transcript PDF fallback when a data shape changes", async () => {
    const h = harness({ responses: { [ACADEMIC]: { body: {} } } });
    await expect(h.run()).rejects.toBeInstanceOf(WorkdayShapeError);
    expect(h.messages.at(-1)).toEqual({
      stage: "error",
      fallback: "upload",
      message: "Workday's pages changed. Import your transcript PDF instead.",
    });
    expect(h.clearStorageData).toHaveBeenCalledOnce();
    expect(h.clearCache).toHaveBeenCalledOnce();
  });

  it("clears the session after failure and keeps session values and response data out of output", async () => {
    const h = harness({ throwFetch: true });
    await expect(h.run()).rejects.toThrow("sensitive response body");
    expect(h.clearStorageData).toHaveBeenCalledOnce();
    expect(h.clearCache).toHaveBeenCalledOnce();
    const exported = JSON.stringify([h.messages, h.logCalls]);
    expect(exported).not.toContain(TOKEN);
    expect(exported).not.toContain(VERSION);
    expect(exported).not.toContain("private sentinel");
  });

  it("clears session state after a successful review without writing imported data", async () => {
    const h = harness();
    const review = await h.run();
    expect(review.completed.length).toBeGreaterThan(0);
    expect(h.clearStorageData).toHaveBeenCalledOnce();
    expect(h.clearCache).toHaveBeenCalledOnce();
  });
  it("reports cleanup failures after attempting both session cleanup operations", async () => {
    const h = harness({ cleanupError: true });
    await expect(h.run()).rejects.toThrow("Workday session cleanup failed");
    expect(h.clearStorageData).toHaveBeenCalledOnce();
    expect(h.clearCache).toHaveBeenCalledOnce();
    expect(h.messages.at(-1)).toEqual({
      stage: "error",
      message: "Could not import records from Workday.",
    });
  });
});
