import { describe, expect, it, vi } from "vitest";
import type { Course } from "@jevschedule/shared";
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
