import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../app.js";
import type { DegreeProgram } from "@jevschedule/shared";

describe("degrees routes", () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
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
      const degree = {
        id: "csc-bs",
        program: "Computer Science, B.S.",
        concentration: "Software Engineering",
        catalogYear: "2026-2027",
        totalCredits: 120,
        source: "https://example.com",
        requirements: [],
      };
      app.degrees.set("csc-bs", degree as DegreeProgram);

      const res = await app.inject({ method: "GET", url: "/degrees" });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual([degree]);
    });
  });

  describe("GET /degrees/:id", () => {
    it("returns 200 OK and degree schema for a valid ID", async () => {
      app = buildServer();
      const degree = {
        id: "csc-bs",
        program: "Computer Science, B.S.",
        concentration: "Software Engineering",
        catalogYear: "2026-2027",
        totalCredits: 120,
        source: "https://example.com",
        requirements: [],
      };
      app.degrees.set("csc-bs", degree as DegreeProgram);

      const res = await app.inject({ method: "GET", url: "/degrees/csc-bs" });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual(degree);
    });

    it("returns 404 Not Found for an unknown degree ID", async () => {
      app = buildServer();
      const res = await app.inject({ method: "GET", url: "/degrees/nope" });

      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({
        statusCode: 404,
        error: "Not Found",
        message: "Degree program 'nope' not found",
      });
    });
  });
});
