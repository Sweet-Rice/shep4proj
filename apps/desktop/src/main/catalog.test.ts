import { describe, expect, it, vi } from "vitest";
import { DegreeProgramSchema, type Course, type DegreeProgram } from "@jevschedule/shared";
import { createCatalogClient, DEFAULT_API_BASE_URL } from "./catalog.js";

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
      label: "Semester 1",
      semester: 1,
      courses: [{ code: "CSC 1350" }],
    },
  ],
});
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("createCatalogClient", () => {
  it("maps course ids to hyphenated paths and caches successful details", async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL) => response(detail));
    const client = createCatalogClient(DEFAULT_API_BASE_URL, fetchImpl as typeof fetch);
    const first = await client.getCourseDetails(["CSC 1350"]);
    const second = await client.getCourseDetails(["CSC 1350", "CSC 1350"]);
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(fetchImpl.mock.calls[0]?.[0]).toBe("http://127.0.0.1:3000/courses/CSC-1350");
    expect(first["CSC 1350"]).toEqual(detail);
    expect(second).toEqual(first);
  });

  it("omits a missing detail while returning the available course", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) =>
      String(input).endsWith("CSC-1351")
        ? response({ error: "Course not found" }, 404)
        : response(detail),
    );
    const client = createCatalogClient(DEFAULT_API_BASE_URL, fetchImpl as typeof fetch);
    const result = await client.getCourseDetails(["CSC 1350", "CSC 1351"]);
    expect(result["CSC 1350"]).toEqual(detail);
    expect(result["CSC 1351"]).toBeUndefined();
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

  it("limits concurrent detail requests to six and returns every fetched detail", async () => {
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
    const client = createCatalogClient(DEFAULT_API_BASE_URL, fetchImpl as typeof fetch);
    const resultPromise = client.getCourseDetails(codes);

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
