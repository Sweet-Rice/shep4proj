import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as yaml from "yaml";
import type { z } from "zod";

export interface LoadedYamlFile<T> {
  path: string;
  data: T;
}

/**
 * Loads all YAML files from a directory, parses them, and validates them
 * against the provided Zod schema. Fails fast by throwing an error on the
 * first malformed or invalid YAML file.
 */
export async function loadYamlFiles<S extends z.ZodTypeAny>(
  directory: string,
  schema: S,
): Promise<LoadedYamlFile<z.output<S>>[]> {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = entries
    .filter(
      (entry) => entry.isFile() && (entry.name.endsWith(".yaml") || entry.name.endsWith(".yml")),
    )
    .map((entry) => entry.name);
  files.sort((a, b) => a.localeCompare(b));

  const results: LoadedYamlFile<z.output<S>>[] = [];

  for (const fileName of files) {
    const fullPath = path.join(directory, fileName);
    const fileContents = await fs.readFile(fullPath, "utf-8");

    let parsed: unknown;
    try {
      parsed = yaml.parse(fileContents);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error("Failed to parse YAML file " + fullPath + ": " + message);
    }

    const result = schema.safeParse(parsed);
    if (!result.success) {
      throw new Error("Schema validation failed for " + fullPath + ": " + result.error.message);
    }

    results.push({ path: fullPath, data: result.data });
  }

  return results;
}
