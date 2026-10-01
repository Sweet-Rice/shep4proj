import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("Manual Test Workday Import Checklist", () => {
  const rootDir = path.resolve(__dirname, "../../..");
  const docPath = path.join(rootDir, "docs", "Manual-Test-Workday-Import.md");

  it("exists in repository docs directory", () => {
    expect(fs.existsSync(docPath)).toBe(true);
  });

  it("contains checklist results for both Windows and macOS operating systems", () => {
    const content = fs.readFileSync(docPath, "utf-8");

    expect(content).toContain("Windows 11");
    expect(content).toContain("macOS");
    expect(content).toContain("PASS");

    expect(content).toContain("Workday Credential Sign-in");
    expect(content).toContain("Academic Record Fetch");
    expect(content).toContain("Import Review Screen");
    expect(content).toContain("SQLite Local Store");
  });
});
