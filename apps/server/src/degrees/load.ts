import { fileURLToPath } from "node:url";
import { DegreeProgramSchema, type DegreeProgram } from "@jevschedule/shared";
import { loadYamlFiles } from "../yaml-loader.js";

export const DEFAULT_DEGREE_DATA_DIR: string = fileURLToPath(
  new URL("../../../../data/degrees/", import.meta.url),
);

export async function loadDegreePrograms(directory: string): Promise<DegreeProgram[]> {
  const loaded = await loadYamlFiles(directory, DegreeProgramSchema);
  const seen = new Map<string, string>();
  const programs: DegreeProgram[] = [];

  for (const { path, data: program } of loaded) {
    const firstPath = seen.get(program.id);
    if (firstPath !== undefined) {
      throw new Error(
        "duplicate degree id " + program.id + " in " + path + " (already in " + firstPath + ")",
      );
    }
    seen.set(program.id, path);
    programs.push(program);
  }

  return programs;
}
