import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const FIXTURE_ROOTS = ["catalog", "sections"] as const;

interface FixtureRow {
  file: string;
  sha256: string;
}

interface FixtureDirectory {
  root: string;
  subdir: string;
  dirPath: string;
  rows: FixtureRow[];
}

function parseReadmeRows(readmeContent: string): FixtureRow[] {
  const normalized = readmeContent.replace(/\r\n/g, "\n");
  const regex = /^\| `([^`]+)` \|.*\| `([0-9a-f]{64})` \|$/gm;
  const rows: FixtureRow[] = [];
  for (const match of normalized.matchAll(regex)) {
    const file = match[1];
    const sha256 = match[2];
    if (file !== undefined && sha256 !== undefined) {
      rows.push({ file, sha256 });
    }
  }
  return rows;
}

const fixtureDirs: FixtureDirectory[] = FIXTURE_ROOTS.flatMap((root) => {
  const rootPath = fileURLToPath(new URL(`../../../fixtures/${root}/`, import.meta.url));
  return readdirSync(rootPath, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((dirent) => {
      const subdir = dirent.name;
      const dirPath = join(rootPath, subdir);
      const rows = parseReadmeRows(readFileSync(join(dirPath, "README.md"), "utf-8"));
      return { root, subdir, dirPath, rows };
    });
});

describe("fixture checksums", () => {
  for (const { root, subdir, dirPath, rows } of fixtureDirs) {
    describe(`${root}/${subdir}`, () => {
      it("has at least one fixture row recorded in README.md", () => {
        expect(
          rows.length,
          `Expected README.md in ${root}/${subdir} to record at least one fixture file`,
        ).toBeGreaterThanOrEqual(1);
      });

      it("matches the set of non-README files against README.md recorded files", () => {
        const actualFiles = readdirSync(dirPath)
          .filter((file) => file !== "README.md")
          .sort();
        const expectedFiles = rows.map((r) => r.file).sort();
        expect(
          actualFiles,
          `Directory files in ${root}/${subdir} do not match the fixture set in README.md`,
        ).toEqual(expectedFiles);
      });

      it.each(rows)("matches sha256 checksum for $file", ({ file, sha256 }) => {
        const filePath = join(dirPath, file);
        const actualHash = createHash("sha256").update(readFileSync(filePath)).digest("hex");
        expect(actualHash, `sha256 mismatch for ${file}`).toBe(sha256);
      });
    });
  }
});
