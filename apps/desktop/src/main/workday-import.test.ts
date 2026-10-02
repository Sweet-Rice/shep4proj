import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import type { GuardedRequest, GuardedResponse } from "@jevschedule/workday/allowlist";
import { WorkdayShapeError } from "@jevschedule/workday/academic-record";
import type { WorkdayImportProgress } from "../shared/ipc.js";
import { createWorkdayImporter } from "./workday-import.js";
import {
  WorkdayHarvestTimeoutError,
  type HarvestTarget,
  type HarvestedRequest,
} from "./workday-harvest.js";

const FIXTURES_DIR = fileURLToPath(new URL("../../../../fixtures/workday/", import.meta.url));
const academicRecord = JSON.parse(
  readFileSync(`${FIXTURES_DIR}academic-record.synthetic.json`, "utf8"),
) as unknown;
const currentRegistrations = JSON.parse(
  readFileSync(`${FIXTURES_DIR}current-registrations.synthetic.json`, "utf8"),
) as unknown;

const TOKEN = "synthetic-secure-token-7f3a";
const HEADERS = {
  "session-secure-token": TOKEN,
  "x-workday-client": "synthetic-client",
  accept: "application/json",
  "content-type": "application/json",
  referer: "https://www.myworkday.com/lsu/d/task/2998$30300.htmld",
};
const ACADEMIC_URL =
  "https://www.myworkday.com/lsu/generic-hub/task/2998$30300.htmld?clientRequestID=synthetic";
const NAV_CONTEXT_URL = "https://www.myworkday.com/lsu/generic-hub/page-context-id/nav1.htmld";
const REGISTRATIONS_URL = "https://www.myworkday.com/lsu/generic-hub/page-context-id/reg2.htmld";
/** Responses keyed by URL; the navigation context answers with a grid-free payload. */
const PAYLOADS: Record<string, unknown> = {
  [ACADEMIC_URL]: academicRecord,
  [NAV_CONTEXT_URL]: { title: "Navigation", widget: "page", body: { children: [] } },
  [REGISTRATIONS_URL]: currentRegistrations,
};

interface HarnessOptions {
  harvest?: (target: HarvestTarget) => Promise<HarvestedRequest[]>;
  fetch?: (request: GuardedRequest) => Promise<GuardedResponse>;
}

function harness(options: HarnessOptions = {}) {
  const events: string[] = [];
  const messages: WorkdayImportProgress[] = [];
  const logCalls: unknown[][] = [];
  const page = { goto: vi.fn(), url: () => "", on: vi.fn(), off: vi.fn() };
  const session = { context: {}, page, profileDir: "synthetic-profile", channel: "chrome" };
  const harvest = vi.fn(async (_page: unknown, target: HarvestTarget) => {
    events.push(`harvest ${target.endpoint.id}`);
    if (options.harvest) return options.harvest(target);
    return target.endpoint.id === "academic-record-get"
      ? [{ url: ACADEMIC_URL, headers: HEADERS }]
      : [
          { url: NAV_CONTEXT_URL, headers: HEADERS },
          { url: REGISTRATIONS_URL, headers: HEADERS },
        ];
  });
  const fetch = vi.fn(async (_page: unknown, request: GuardedRequest, _allowed: unknown) => {
    events.push(`fetch ${request.url}`);
    if (options.fetch) return options.fetch(request);
    return { status: 200, json: PAYLOADS[request.url] ?? null };
  });
  const teardown = vi.fn(async () => {
    events.push("teardown");
  });
  const log = Object.fromEntries(
    ["debug", "info", "warn", "error"].map((level) => [
      level,
      (...args: unknown[]) => logCalls.push(args),
    ]),
  ) as never;
  const importer = createWorkdayImporter({
    launch: vi.fn(async () => session) as never,
    waitForLogin: vi.fn(async () => ({ status: "success", page })) as never,
    teardown: teardown as never,
    harvest: harvest as never,
    fetch: fetch as never,
    log,
  });
  const run = () => importer.run((progress) => messages.push(progress));
  /** Everything that left the importer other than the returned review. */
  const leaked = () => JSON.stringify([messages, logCalls]);
  return { run, events, messages, logCalls, leaked, page, harvest, fetch, teardown };
}

describe("createWorkdayImporter", () => {
  it("harvests UI requests, reads them only through the guarded fetch, and maps the review", async () => {
    const h = harness();
    const review = await h.run();

    expect(h.messages.map(({ stage }) => stage)).toEqual(["signing-in", "fetching", "review"]);
    expect(h.events).toEqual([
      "harvest academic-record-get",
      `fetch ${ACADEMIC_URL}`,
      "harvest current-registrations-get",
      `fetch ${NAV_CONTEXT_URL}`,
      `fetch ${REGISTRATIONS_URL}`,
      "teardown",
    ]);
    expect(h.harvest.mock.calls.map(([page, target]) => [page, target.uiUrl])).toEqual([
      [h.page, "https://www.myworkday.com/lsu/d/task/2998$30300.htmld"],
      [h.page, "https://www.myworkday.com/lsu/d/task/2998$28771.htmld"],
    ]);
    for (const [page, request, allowed] of h.fetch.mock.calls) {
      expect(page).toBe(h.page);
      expect(request).toEqual({ method: "GET", url: request.url, headers: HEADERS });
      expect(allowed).toEqual([
        expect.objectContaining({
          id: request.url === ACADEMIC_URL ? "academic-record-get" : "current-registrations-get",
        }),
      ]);
    }
    expect(review.completed).toEqual(expect.arrayContaining(["CSC 1350"]));
    expect(review.inProgress.flatMap((term) => term.courses)).toEqual(
      expect.arrayContaining(["CSC 4330"]),
    );
    expect(h.teardown).toHaveBeenCalledOnce();
  });

  it("keeps the harvested token and raw responses out of progress events and logs", async () => {
    const h = harness();
    const review = await h.run();

    expect(h.logCalls.length).toBeGreaterThan(0);
    expect(h.leaked()).not.toContain(TOKEN);
    expect(JSON.stringify(review)).not.toContain(TOKEN);
    expect(JSON.stringify(h.logCalls)).not.toContain("generic-hub");
    expect(JSON.stringify(h.logCalls)).not.toContain("Enrollments");
    expect(JSON.stringify(h.logCalls)).not.toContain("My Enrolled Courses");
  });

  it("does not fetch until the harvest has produced a token-bearing request", async () => {
    let release!: (requests: HarvestedRequest[]) => void;
    const h = harness({
      harvest: (target) =>
        target.endpoint.id === "academic-record-get"
          ? new Promise((resolve) => (release = resolve))
          : Promise.resolve([{ url: REGISTRATIONS_URL, headers: HEADERS }]),
    });
    const running = h.run();
    await vi.waitFor(() => expect(h.harvest).toHaveBeenCalledOnce());
    expect(h.fetch).not.toHaveBeenCalled();
    release([{ url: ACADEMIC_URL, headers: HEADERS }]);
    await running;
    expect(h.fetch.mock.calls[0]?.[1].headers?.["session-secure-token"]).toBe(TOKEN);
  });

  it("emits a generic error, never fetches, and tears down when the harvest times out", async () => {
    const h = harness({ harvest: () => Promise.reject(new WorkdayHarvestTimeoutError()) });

    await expect(h.run()).rejects.toBeInstanceOf(WorkdayHarvestTimeoutError);
    expect(h.messages.map(({ stage }) => stage)).toEqual(["signing-in", "fetching", "error"]);
    expect(h.messages.at(-1)).toEqual({
      stage: "error",
      message: "Could not import records from Workday.",
    });
    expect(h.fetch).not.toHaveBeenCalled();
    expect(h.teardown).toHaveBeenCalledOnce();
  });

  it("offers the upload fallback and tears down when no candidate parses", async () => {
    const h = harness({ fetch: async () => ({ status: 200, json: { body: {} } }) });

    await expect(h.run()).rejects.toBeInstanceOf(WorkdayShapeError);
    expect(h.messages.at(-1)).toEqual({
      stage: "error",
      fallback: "upload",
      message: "Workday's pages changed. Import your transcript PDF instead.",
    });
    expect(h.teardown).toHaveBeenCalledOnce();
  });

  it("offers the upload fallback when the harvest finds no candidates", async () => {
    const h = harness({ harvest: async () => [] });

    await expect(h.run()).rejects.toBeInstanceOf(WorkdayShapeError);
    expect(h.messages.at(-1)).toMatchObject({ stage: "error", fallback: "upload" });
    expect(h.fetch).not.toHaveBeenCalled();
    expect(h.teardown).toHaveBeenCalledOnce();
  });

  it("emits a generic error when every candidate is rejected by Workday", async () => {
    const h = harness({ fetch: async () => ({ status: 401, json: null }) });

    await expect(h.run()).rejects.not.toBeInstanceOf(WorkdayShapeError);
    expect(h.messages.at(-1)).toEqual({
      stage: "error",
      message: "Could not import records from Workday.",
    });
    expect(h.teardown).toHaveBeenCalledOnce();
  });

  it("emits a generic error and tears down when the guarded fetch throws", async () => {
    const h = harness({
      fetch: async () => {
        throw new Error("sensitive response body");
      },
    });

    await expect(h.run()).rejects.toThrow("sensitive response body");
    expect(h.messages.at(-1)).toEqual({
      stage: "error",
      message: "Could not import records from Workday.",
    });
    expect(h.teardown).toHaveBeenCalledOnce();
    expect(JSON.stringify(h.logCalls)).not.toContain("sensitive response body");
  });
});
