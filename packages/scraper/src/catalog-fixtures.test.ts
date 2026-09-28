import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const CATALOG_DIR = fileURLToPath(new URL("../../../fixtures/catalog/", import.meta.url));

interface FixtureRow {
  file: string;
  sha256: string;
}

interface CatalogDirectory {
  yearDir: string;
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

const catalogSubdirs = readdirSync(CATALOG_DIR, { withFileTypes: true })
  .filter((dirent) => dirent.isDirectory())
  .map((dirent) => dirent.name)
  .sort();

const catalogDirs: CatalogDirectory[] = catalogSubdirs.map((yearDir) => {
  const dirPath = join(CATALOG_DIR, yearDir);
  const readmePath = join(dirPath, "README.md");
  const readmeContent = readFileSync(readmePath, "utf-8");
  const rows = parseReadmeRows(readmeContent);
  return {
    yearDir,
    dirPath,
    rows,
  };
});

describe("catalog fixtures", () => {
  for (const { yearDir, dirPath, rows } of catalogDirs) {
    describe(yearDir, () => {
      it("has at least one fixture row recorded in README.md", () => {
        expect(
          rows.length,
          `Expected README.md in ${yearDir} to record at least one fixture file`,
        ).toBeGreaterThanOrEqual(1);
      });

      it("matches the set of non-README files against README.md recorded files", () => {
        const actualFiles = readdirSync(dirPath)
          .filter((file) => file !== "README.md")
          .sort();
        const expectedFiles = rows.map((r) => r.file).sort();
        expect(
          actualFiles,
          `Directory files in ${yearDir} do not match the fixture set in README.md`,
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
