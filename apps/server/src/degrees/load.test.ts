import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { buildServer } from "../app.js";
import { DEFAULT_DEGREE_DATA_DIR, loadDegreePrograms } from "./load.js";

const BROKEN_FIXTURE_DIR = fileURLToPath(
  new URL("../../test-fixtures/degrees/broken/", import.meta.url),
);
const INVALID_FIXTURE_DIR = fileURLToPath(
  new URL("../../test-fixtures/degrees/invalid/", import.meta.url),
);

describe("loadDegreePrograms and buildServer degreeDataDir", () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    if (app) {
      await app.close();
      app = undefined;
    }
  });

  it("buildServer rejects on ready when degreeDataDir points to broken YAML", async () => {
    app = buildServer({ degreeDataDir: BROKEN_FIXTURE_DIR });
    await expect(app.ready()).rejects.toThrow(/Failed to parse YAML file/);
  });

  it("rejects when degreeDataDir points to schema-invalid degree YAML", async () => {
    await expect(loadDegreePrograms(INVALID_FIXTURE_DIR)).rejects.toThrow(
      /Schema validation failed/,
    );
    app = buildServer({ degreeDataDir: INVALID_FIXTURE_DIR });
    await expect(app.ready()).rejects.toThrow(/Schema validation failed/);
  });

  it("rejects duplicate degree id when the same program is present under two file names", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "duplicate-degree-test-"));
    try {
      const realProgramFile = path.join(
        DEFAULT_DEGREE_DATA_DIR,
        "csc-software-engineering-2026-2027.yaml",
      );
      await fs.copyFile(realProgramFile, path.join(tempDir, "prog-a.yaml"));
      await fs.copyFile(realProgramFile, path.join(tempDir, "prog-b.yaml"));

      await expect(loadDegreePrograms(tempDir)).rejects.toThrow(/duplicate degree id/);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it("loadDegreePrograms loads programs from DEFAULT_DEGREE_DATA_DIR including csc-software-engineering-2026-2027", async () => {
    const programs = await loadDegreePrograms(DEFAULT_DEGREE_DATA_DIR);
    expect(programs.length).toBeGreaterThan(0);
    const segProgram = programs.find((p) => p.id === "csc-software-engineering-2026-2027");
    expect(segProgram).toBeDefined();
    expect(segProgram?.program).toBe("Computer Science, B.S.");
  });

  it("buildServer resolves on ready with DEFAULT_DEGREE_DATA_DIR", async () => {
    app = buildServer({ degreeDataDir: DEFAULT_DEGREE_DATA_DIR });
    await expect(app.ready()).resolves.toBe(app);
  });
});
