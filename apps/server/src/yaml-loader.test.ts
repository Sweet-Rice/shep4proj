import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { z } from "zod";
import { loadYamlFiles } from "./yaml-loader.js";

const TestSchema = z.object({
  name: z.string(),
  version: z.number(),
});

describe("yaml-loader", () => {
  let tempDir: string;

  beforeAll(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "yaml-loader-test-"));
  });

  afterAll(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("should parse and validate valid YAML files successfully", async () => {
    const validFile1 = path.join(tempDir, "valid1.yaml");
    await fs.writeFile(validFile1, "name: Test One\nversion: 1\n");

    const validFile2 = path.join(tempDir, "valid2.yml");
    await fs.writeFile(validFile2, "name: Test Two\nversion: 2\n");

    const results = await loadYamlFiles(tempDir, TestSchema);
    expect(results).toHaveLength(2);

    const parsedData = results.map((r) => r.data);
    expect(parsedData).toContainEqual({ name: "Test One", version: 1 });
    expect(parsedData).toContainEqual({ name: "Test Two", version: 2 });

    // Cleanup for next tests
    await fs.rm(validFile1);
    await fs.rm(validFile2);
  });

  it("should fail fast on malformed YAML", async () => {
    const malformedFile = path.join(tempDir, "malformed.yaml");
    await fs.writeFile(malformedFile, "name: Test\nversion: [unclosed array");

    await expect(loadYamlFiles(tempDir, TestSchema)).rejects.toThrow(/Failed to parse YAML file/);

    await fs.rm(malformedFile);
  });

  it("should fail fast on missing required fields or invalid schema", async () => {
    const invalidSchemaFile = path.join(tempDir, "invalid-schema.yaml");
    // Missing 'version'
    await fs.writeFile(invalidSchemaFile, "name: Invalid Schema\n");

    await expect(loadYamlFiles(tempDir, TestSchema)).rejects.toThrow(/Schema validation failed/);

    await fs.rm(invalidSchemaFile);
  });
});
