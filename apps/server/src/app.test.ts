import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildServer } from "./app.js";

describe("buildServer", () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("answers GET /health with 200 and { status: 'ok' }", async () => {
    app = buildServer();
    const res = await app.inject({ method: "GET", url: "/health" });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toMatch(/^application\/json/);
    expect(res.json()).toEqual({ status: "ok" });
  });

  it("returns 404 for unknown routes", async () => {
    app = buildServer();
    const res = await app.inject({ method: "GET", url: "/nope" });

    expect(res.statusCode).toBe(404);
  });

  it("does not accept POST on /health", async () => {
    app = buildServer();
    const res = await app.inject({ method: "POST", url: "/health" });

    expect(res.statusCode).toBe(404);
  });

  describe("GET /degrees", () => {
    it("returns an empty array when no degrees are loaded", async () => {
      app = buildServer();
      const res = await app.inject({ method: "GET", url: "/degrees" });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual([]);
    });

    it("returns a list of loaded degrees", async () => {
      app = buildServer();
      app.degrees.set("csc-bs", { id: "csc-bs", title: "Computer Science, B.S." } as unknown as import("@jevschedule/shared").DegreeProgram);

      const res = await app.inject({ method: "GET", url: "/degrees" });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual([{ id: "csc-bs", title: "Computer Science, B.S." }]);
    });
  });

  describe("GET /degrees/:id", () => {
    it("returns 200 OK and degree schema for a valid ID", async () => {
      app = buildServer();
      app.degrees.set("csc-bs", {
        id: "csc-bs",
        title: "Computer Science, B.S.",
        requiredCourses: ["CSC 1350"],
      } as unknown as import("@jevschedule/shared").DegreeProgram);

      const res = await app.inject({ method: "GET", url: "/degrees/csc-bs" });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        id: "csc-bs",
        title: "Computer Science, B.S.",
        requiredCourses: ["CSC 1350"],
      });
    });

    it("returns 404 Not Found for an unknown degree ID", async () => {
      app = buildServer();
      const res = await app.inject({ method: "GET", url: "/degrees/nope" });

      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({ error: "Not Found" });
    });
  });
});
