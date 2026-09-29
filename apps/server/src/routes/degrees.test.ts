import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { DegreeProgramSchema } from "@jevschedule/shared";
import { buildServer } from "../app.js";
import { DEFAULT_DEGREE_DATA_DIR } from "../degrees/load.js";
import type { DegreeSummary } from "./degrees.js";

describe("degrees routes", () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  describe("with DEFAULT_DEGREE_DATA_DIR", () => {
    it("GET /degrees returns summaries sorted by id with exactly 5 keys", async () => {
      app = buildServer({ degreeDataDir: DEFAULT_DEGREE_DATA_DIR });
      const res = await app.inject({ method: "GET", url: "/degrees" });

      expect(res.statusCode).toBe(200);
      const body = res.json<{ degrees: DegreeSummary[] }>();
      expect(Array.isArray(body.degrees)).toBe(true);

      const ids = body.degrees.map((d) => d.id);
      expect(ids).toContain("csc-software-engineering-2026-2027");

      const sortedIds = [...ids].sort((a, b) => a.localeCompare(b));
      expect(ids).toEqual(sortedIds);

      const expectedKeys = ["catalogYear", "concentration", "id", "program", "totalCredits"].sort();
      for (const summary of body.degrees) {
        expect(Object.keys(summary).sort()).toEqual(expectedKeys);
      }
    });

    it("GET /degrees/:id returns the full degree program", async () => {
      app = buildServer({ degreeDataDir: DEFAULT_DEGREE_DATA_DIR });
      const res = await app.inject({
        method: "GET",
        url: "/degrees/csc-software-engineering-2026-2027",
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.requirements.length).toBeGreaterThan(0);
      expect(() => DegreeProgramSchema.parse(body)).not.toThrow();
    });

    it("GET /degrees/non-existent-id returns 404 with Degree not found", async () => {
      app = buildServer({ degreeDataDir: DEFAULT_DEGREE_DATA_DIR });
      const res = await app.inject({
        method: "GET",
        url: "/degrees/non-existent-id",
      });

      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({ error: "Degree not found" });
    });
  });

  it("lists both programs sorted by id when a new data file is added", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "degrees-route-test-"));
    try {
      const realYamlPath = path.join(
        DEFAULT_DEGREE_DATA_DIR,
        "csc-software-engineering-2026-2027.yaml",
      );
      const originalContent = await fs.readFile(realYamlPath, "utf-8");

      await fs.writeFile(
        path.join(tempDir, "csc-software-engineering-2026-2027.yaml"),
        originalContent,
      );

      const copyContent = originalContent.replace(
        "id: csc-software-engineering-2026-2027",
        "id: csc-software-engineering-copy-2026-2027",
      );
      await fs.writeFile(
        path.join(tempDir, "csc-software-engineering-copy-2026-2027.yaml"),
        copyContent,
      );

      app = buildServer({ degreeDataDir: tempDir });
      const res = await app.inject({ method: "GET", url: "/degrees" });

      expect(res.statusCode).toBe(200);
      const body = res.json<{ degrees: DegreeSummary[] }>();
      const ids = body.degrees.map((d) => d.id);
      expect(ids).toEqual([
        "csc-software-engineering-2026-2027",
        "csc-software-engineering-copy-2026-2027",
      ]);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it("returns 404 on GET /degrees when degreeDataDir is not provided", async () => {
    app = buildServer();
    const res = await app.inject({ method: "GET", url: "/degrees" });

    expect(res.statusCode).toBe(404);
  });
});
