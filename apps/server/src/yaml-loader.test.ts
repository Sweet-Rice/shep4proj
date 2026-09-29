import type { Dirent } from "node:fs";
import * as fs from "node:fs/promises";
import type * as fsType from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { loadYamlFiles } from "./yaml-loader.js";

let readdirOrderHook: ((entries: Dirent[]) => Dirent[]) | null = null;

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof fsType>();
  return {
    ...actual,
    readdir: (async (pathParam: string, optionsParam?: unknown) => {
      const res = await (actual.readdir as (p: string, o?: unknown) => Promise<unknown>)(
        pathParam,
        optionsParam,
      );
      if (readdirOrderHook && Array.isArray(res)) {
        return readdirOrderHook(res as Dirent[]);
      }
      return res;
    }) as typeof actual.readdir,
  };
});
const TestSchema = z.object({
  name: z.string(),
  version: z.number(),
});

describe("yaml-loader", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "yaml-loader-test-"));
  });

  afterEach(async () => {
    readdirOrderHook = null;
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("parses valid YAML files returned in alphabetical file name order", async () => {
    const file2 = path.join(tempDir, "beta.yml");
    await fs.writeFile(file2, "name: Beta\nversion: 2\n");

    const file1 = path.join(tempDir, "alpha.yaml");
    await fs.writeFile(file1, "name: Alpha\nversion: 1\n");

    // Force readdir to yield entries in reverse alphabetical order, proving
    // loadYamlFiles actively sorts entries rather than relying on filesystem order.
    readdirOrderHook = (entries) => [...entries].reverse();

    const results = await loadYamlFiles(tempDir, TestSchema);
    expect(results).toHaveLength(2);
    expect(results[0]?.data).toEqual({ name: "Alpha", version: 1 });
    expect(results[1]?.data).toEqual({ name: "Beta", version: 2 });
  });

  it("ignores non-yaml files such as .txt", async () => {
    const yamlFile = path.join(tempDir, "valid.yaml");
    await fs.writeFile(yamlFile, "name: Valid\nversion: 1\n");

    const textFile = path.join(tempDir, "notes.txt");
    await fs.writeFile(textFile, "some notes");

    const results = await loadYamlFiles(tempDir, TestSchema);
    expect(results).toHaveLength(1);
    expect(results[0]?.data).toEqual({ name: "Valid", version: 1 });
  });
  it("fails fast on malformed YAML", async () => {
    const malformedFile = path.join(tempDir, "malformed.yaml");
    await fs.writeFile(malformedFile, "name: Test\nversion: [unclosed array");

    await expect(loadYamlFiles(tempDir, TestSchema)).rejects.toThrow(/Failed to parse YAML file/);
  });

  it("fails fast on schema validation failure", async () => {
    const invalidSchemaFile = path.join(tempDir, "invalid-schema.yaml");
    await fs.writeFile(invalidSchemaFile, "name: Invalid Schema\n");

    await expect(loadYamlFiles(tempDir, TestSchema)).rejects.toThrow(/Schema validation failed/);
  });
});
