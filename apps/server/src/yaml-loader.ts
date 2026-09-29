import * as fs from "fs/promises";
import * as path from "path";
import * as yaml from "yaml";
import { z } from "zod";

/**
 * Loads all YAML files from a directory, parses them, and validates them
 * against the provided Zod schema. Fails fast by throwing an error on the
 * first malformed or invalid YAML file.
 */
export async function loadYamlFiles<T>(
  directory: string,
  schema: z.ZodTypeAny,
): Promise<{ path: string; data: T }[]> {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const results: { path: string; data: T }[] = [];

  for (const entry of entries) {
    if (entry.isFile() && (entry.name.endsWith(".yaml") || entry.name.endsWith(".yml"))) {
      const fullPath = path.join(directory, entry.name);
      const fileContents = await fs.readFile(fullPath, "utf-8");

      let parsed: unknown;
      try {
        parsed = yaml.parse(fileContents);
      } catch (error: unknown) {
        throw new Error(
          `Failed to parse YAML file ${fullPath}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      const result = schema.safeParse(parsed);
      if (!result.success) {
        throw new Error(`Schema validation failed for ${fullPath}: ${result.error.message}`);
      }

      results.push({ path: fullPath, data: result.data });
    }
  }

  return results;
}
