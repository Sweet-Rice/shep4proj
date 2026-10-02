import { describe, expect, it, vi } from "vitest";
import {
  DegreeProgramSchema,
  type Course,
  type DegreeProgram,
  type Section,
} from "@jevschedule/shared";
import { createCatalogClient, DEFAULT_API_BASE_URL, resolveApiBaseUrl } from "./catalog.js";

const course: Course = {
  catalogYear: "2026-2027",
  code: "CSC 1350",
  title: "Computer Science I",
  credits: { min: 3, max: 3, note: null },
  description: "Introductory course",
  prerequisiteText: null,
};
const detail = {
  ...course,
  prereq: { tree: null, needsReview: false, reviewReason: null, notes: [] },
};
const degree: DegreeProgram = DegreeProgramSchema.parse({
  id: "csc-software-engineering-2026-2027",
  program: "Computer Science, B.S.",
  concentration: "Software Engineering",
  catalogYear: "2026-2027",
  totalCredits: 120,
  source: "https://example.test/degree",
  requirements: [
    {
      kind: "fixed",
      id: "semester-1",
      area: "Computer Science",
      label: "Semester 1",
      semester: 1,
      courses: [{ code: "CSC 1350" }],
    },
  ],
});
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const section: Section = {
  term: "LSUAM_FALL_2026",
  courseCode: "CSC 1350",
  sectionNumber: "001",
  sectionType: "LEC",
  credits: { min: 3, max: 3, note: null },
  instructor: "A. Professor",
  location: "Taylor Hall",
  deliveryMode: "On Campus",
  enrollment: 20,
  capacity: 30,
  meetings: [{ days: ["Mon"], startMinute: 600, endMinute: 650 }],
};

describe("resolveApiBaseUrl", () => {
  it("prefers a non-empty runtime URL over the build-time URL", () => {
    expect(resolveApiBaseUrl("https://runtime.example", "https://build.example")).toBe(
      "https://runtime.example",
    );
  });

  it("uses the build-time URL when the runtime URL is empty or missing", () => {
    expect(resolveApiBaseUrl(undefined, "https://build.example")).toBe("https://build.example");
    expect(resolveApiBaseUrl("", "https://build.example")).toBe("https://build.example");
  });

  it("falls back to the default when both configured URLs are empty or missing", () => {
    expect(resolveApiBaseUrl(undefined, undefined)).toBe(DEFAULT_API_BASE_URL);
    expect(resolveApiBaseUrl("", "")).toBe(DEFAULT_API_BASE_URL);
  });
});

describe("createCatalogClient", () => {
  it("posts uncached codes to the batch endpoint and caches the details", async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      response({ courses: [detail] }),
    );
    const client = createCatalogClient(DEFAULT_API_BASE_URL, fetchImpl as typeof fetch);
    const first = await client.getCourseDetails(["CSC 1350"]);
    const second = await client.getCourseDetails(["CSC 1350", "CSC 1350"]);
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(fetchImpl.mock.calls[0]?.[0]).toBe("http://127.0.0.1:3000/courses/details");
    expect(fetchImpl.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ codes: ["CSC 1350"] }),
    });
    expect(first["CSC 1350"]).toEqual(detail);
    expect(second).toEqual(first);
  });

  it("sends one batch request per 500 codes and only for uncached codes", async () => {
    const codes = Array.from({ length: 1201 }, (_, index) => `CSC ${String(1000 + index)}`);
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { codes: string[] };
      return response({ courses: body.codes.map((code) => ({ ...detail, code })) });
    });
    const client = createCatalogClient(DEFAULT_API_BASE_URL, fetchImpl as typeof fetch);

    const result = await client.getCourseDetails(codes);
    expect(Object.keys(result)).toHaveLength(1201);
    const sizes = fetchImpl.mock.calls.map(
      ([, init]) => JSON.parse(String(init?.body)).codes.length,
    );
    expect(sizes).toEqual([500, 500, 201]);

    await client.getCourseDetails([...codes, "CSC 9999"]);
    expect(fetchImpl).toHaveBeenCalledTimes(4);
    expect(JSON.parse(String(fetchImpl.mock.calls[3]?.[1]?.body))).toEqual({ codes: ["CSC 9999"] });
  });

  it("omits codes the batch endpoint does not return", async () => {
    const fetchImpl = vi.fn(async () => response({ courses: [detail] }));
    const client = createCatalogClient(DEFAULT_API_BASE_URL, fetchImpl as typeof fetch);
    const result = await client.getCourseDetails(["CSC 1350", "CSC 1351"]);
    expect(result["CSC 1350"]).toEqual(detail);
    expect(result["CSC 1351"]).toBeUndefined();
  });

  it("fails clearly when the batch endpoint errors", async () => {
    const fetchImpl = vi.fn(async () => response({ error: "boom" }, 500));
    const client = createCatalogClient(DEFAULT_API_BASE_URL, fetchImpl as typeof fetch);
    await expect(client.getCourseDetails(["CSC 1350"])).rejects.toThrow(
      "Course catalog request failed: POST /courses/details returned 500",
    );
  });

  it("falls back to per-course requests when the server has no batch endpoint", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") return response({ error: "Route not found" }, 404);
      return String(input).endsWith("CSC-1351")
        ? response({ error: "Course not found" }, 404)
        : response(detail);
    });
    const client = createCatalogClient(DEFAULT_API_BASE_URL, fetchImpl as typeof fetch);

    const result = await client.getCourseDetails(["CSC 1350", "CSC 1351"]);
    expect(result["CSC 1350"]).toEqual(detail);
    expect(result["CSC 1351"]).toBeUndefined();
    expect(fetchImpl.mock.calls.map(([input]) => String(input))).toEqual([
      "http://127.0.0.1:3000/courses/details",
      "http://127.0.0.1:3000/courses/CSC-1350",
      "http://127.0.0.1:3000/courses/CSC-1351",
    ]);

    await client.getCourseDetails(["CSC 1352"]);
    expect(fetchImpl).toHaveBeenCalledTimes(4);
    expect(String(fetchImpl.mock.calls[3]?.[0])).toBe("http://127.0.0.1:3000/courses/CSC-1352");
  });
  it("maps and caches course offering history by code", async () => {
    const fetchImpl = vi.fn(async () =>
      response({
        history: [
          {
            term: "LSUAM_FALL_2026",
            sectionCount: 2,
            capturedAt: "2026-08-01T00:00:00Z",
          },
        ],
      }),
    );
    const client = createCatalogClient(DEFAULT_API_BASE_URL, fetchImpl as typeof fetch);

    const first = await client.getCourseHistory("CSC 1350");
    const second = await client.getCourseHistory("CSC 1350");

    expect(first).toEqual([{ term: "LSUAM_FALL_2026", sectionCount: 2 }]);
    expect(second).toBe(first);
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(fetchImpl).toHaveBeenCalledWith("http://127.0.0.1:3000/courses/CSC-1350/history");
  });

  it("caches course offering history separately for each code", async () => {
    const historyFor = (term: string, sectionCount: number) => ({
      history: [{ term, sectionCount, capturedAt: "2026-08-01T00:00:00Z" }],
    });
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) =>
      String(input).endsWith("/CSC-1350/history")
        ? response(historyFor("LSUAM_FALL_2026", 2))
        : response(historyFor("LSUAM_SPRING_2027", 1)),
    );
    const client = createCatalogClient(DEFAULT_API_BASE_URL, fetchImpl as typeof fetch);

    await client.getCourseHistory("CSC 1350");
    const other = await client.getCourseHistory("CSC 3102");
    const again = await client.getCourseHistory("CSC 1350");

    expect(other).toEqual([{ term: "LSUAM_SPRING_2027", sectionCount: 1 }]);
    expect(again).toEqual([{ term: "LSUAM_FALL_2026", sectionCount: 2 }]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("returns and caches empty history for a missing course", async () => {
    const fetchImpl = vi.fn(async () => response({ error: "Course not found" }, 404));
    const client = createCatalogClient(DEFAULT_API_BASE_URL, fetchImpl as typeof fetch);

    await expect(client.getCourseHistory("CSC 9999")).resolves.toEqual([]);
    await expect(client.getCourseHistory("CSC 9999")).resolves.toEqual([]);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("rejects a failed history request without caching it", async () => {
    const fetchImpl = vi
      .fn(async () =>
        response({
          history: [
            { term: "LSUAM_FALL_2026", sectionCount: 2, capturedAt: "2026-08-01T00:00:00Z" },
          ],
        }),
      )
      .mockResolvedValueOnce(response({ error: "Internal error" }, 500));
    const client = createCatalogClient(DEFAULT_API_BASE_URL, fetchImpl as typeof fetch);

    await expect(client.getCourseHistory("CSC 1350")).rejects.toThrow("returned 500");
    await expect(client.getCourseHistory("CSC 1350")).resolves.toEqual([
      { term: "LSUAM_FALL_2026", sectionCount: 2 },
    ]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("rejects malformed course history responses", async () => {
    const malformed = response({
      history: [{ term: "LSUAM_FALL_2026", sectionCount: 2 }],
    });
    const client = createCatalogClient(
      DEFAULT_API_BASE_URL,
      vi.fn(async () => malformed) as typeof fetch,
    );
    await expect(client.getCourseHistory("CSC 1350")).rejects.toThrow();
  });

  it("reports network failures and retries instead of caching them", async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue(response({ courses: [course] }));
    const client = createCatalogClient(DEFAULT_API_BASE_URL, fetchImpl as typeof fetch);
    await expect(client.listCourses()).rejects.toThrow(
      "Course catalog server unreachable at http://127.0.0.1:3000",
    );
    await expect(client.listCourses()).resolves.toEqual([course]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("caches successful course lists", async () => {
    const fetchImpl = vi.fn(async () => response({ courses: [course] }));
    const client = createCatalogClient(DEFAULT_API_BASE_URL, fetchImpl as typeof fetch);
    await client.listCourses();
    await client.listCourses();
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("returns and caches a successful degree response", async () => {
    const fetchImpl = vi.fn(async () => response(degree));
    const client = createCatalogClient(DEFAULT_API_BASE_URL, fetchImpl as typeof fetch);

    const first = await client.getDegree(degree.id);
    const second = await client.getDegree(degree.id);

    expect(first).toEqual(degree);
    expect(second).toEqual(degree);
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(fetchImpl).toHaveBeenCalledWith(
      "http://127.0.0.1:3000/degrees/csc-software-engineering-2026-2027",
    );
  });

  it("fetches term sections without caching and validates the response", async () => {
    const fetchImpl = vi.fn(async () => response({ sections: [section] }));
    const client = createCatalogClient(DEFAULT_API_BASE_URL, fetchImpl as typeof fetch);

    await expect(client.listSections("CSC 1350", "LSUAM_FALL_2026")).resolves.toEqual([section]);
    await client.listSections("CSC 1350", "LSUAM_FALL_2026");

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl).toHaveBeenCalledWith(
      "http://127.0.0.1:3000/sections?course=CSC-1350&term=LSUAM_FALL_2026",
    );

    const malformedClient = createCatalogClient(
      DEFAULT_API_BASE_URL,
      vi.fn(async () =>
        response({ sections: [{ ...section, sectionNumber: "bad" }] }),
      ) as typeof fetch,
    );
    await expect(malformedClient.listSections("CSC 1350", "LSUAM_FALL_2026")).rejects.toThrow();
  });

  it("reports an unreachable server when sections cannot be fetched", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("offline"));
    const client = createCatalogClient(DEFAULT_API_BASE_URL, fetchImpl as typeof fetch);
    await expect(client.listSections("CSC 1350", "LSUAM_FALL_2026")).rejects.toThrow(
      "Course catalog server unreachable at http://127.0.0.1:3000",
    );
  });

  it("limits concurrent fallback detail requests to six and returns every fetched detail", async () => {
    const codes = Array.from({ length: 8 }, (_, index) => `CSC ${1001 + index}` as const);
    let active = 0;
    let peakActive = 0;
    let nextIndex = 0;
    const pending: Array<{ code: string; resolve: (result: Response) => void }> = [];
    const startWaiters: Array<{ count: number; resolve: () => void }> = [];
    const fetchImpl = vi.fn(async () => {
      active += 1;
      peakActive = Math.max(peakActive, active);
      const code = codes[nextIndex++];
      if (code === undefined) throw new Error("Unexpected catalog request");
      const result = new Promise<Response>((resolve) => {
        pending.push({
          code,
          resolve: (response) => {
            active -= 1;
            resolve(response);
          },
        });
      });
      for (let index = startWaiters.length - 1; index >= 0; index -= 1) {
        const waiter = startWaiters[index];
        if (waiter && fetchImpl.mock.calls.length >= waiter.count) {
          startWaiters.splice(index, 1);
          waiter.resolve();
        }
      }
      return result;
    });
    const noBatchEndpoint = (input: RequestInfo | URL, init?: RequestInit) =>
      init?.method === "POST" ? Promise.resolve(response({}, 404)) : fetchImpl();
    const client = createCatalogClient(DEFAULT_API_BASE_URL, noBatchEndpoint as typeof fetch);
    const resultPromise = client.getCourseDetails(codes);
    await Promise.resolve();
    await Promise.resolve();

    const releasePending = (count: number) => {
      for (const request of pending.splice(0, count)) {
        request.resolve(
          response({
            ...detail,
            code: request.code,
            title: `Course ${request.code}`,
          }),
        );
      }
    };

    expect(fetchImpl).toHaveBeenCalledTimes(6);
    expect(peakActive).toBe(6);
    releasePending(6);
    await new Promise<void>((resolve) => {
      if (fetchImpl.mock.calls.length >= 8) resolve();
      else startWaiters.push({ count: 8, resolve });
    });
    expect(peakActive).toBe(6);
    releasePending(2);

    const details = await resultPromise;
    expect(Object.keys(details).sort()).toEqual([...codes].sort());
    for (const code of codes) {
      expect(details[code]).toMatchObject({ code, title: `Course ${code}` });
    }
    expect(peakActive).toBe(6);
  });
  it("rejects malformed response bodies", async () => {
    const client = createCatalogClient(
      DEFAULT_API_BASE_URL,
      vi.fn(async () => response({ courses: [{ code: "bad" }] })) as typeof fetch,
    );
    await expect(client.listCourses()).rejects.toThrow();
  });

  it("rejects a non-http base URL", () => {
    expect(() => createCatalogClient("file:///tmp/catalog")).toThrow(
      "JEVSCHEDULE_API_URL must be an http(s) URL",
    );
  });
});
