import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("release.yml workflow configuration", () => {
  const rootDir = path.resolve(__dirname, "../../..");
  const releaseWorkflowPath = path.join(rootDir, ".github/workflows/release.yml");

  it("exists and triggers on version tags", () => {
    expect(fs.existsSync(releaseWorkflowPath)).toBe(true);

    const content = fs.readFileSync(releaseWorkflowPath, "utf-8");
    expect(content).toContain("name: Release");
    expect(content).toContain("tags:");
    expect(content).toContain('- "v*"');
  });

  it("includes matrix strategy for Linux, Windows, and macOS installers", () => {
    const content = fs.readFileSync(releaseWorkflowPath, "utf-8");

    expect(content).toContain("ubuntu-latest");
    expect(content).toContain("windows-latest");
    expect(content).toContain("macos-latest");

    expect(content).toContain("dist:linux");
    expect(content).toContain("dist:win");
    expect(content).toContain("dist:mac");
  });

  it("uses softprops/action-gh-release to upload release installer assets", () => {
    const content = fs.readFileSync(releaseWorkflowPath, "utf-8");

    expect(content).toContain("softprops/action-gh-release");
    expect(content).toContain("apps/desktop/dist/*.exe");
    expect(content).toContain("apps/desktop/dist/*.dmg");
    expect(content).toContain("apps/desktop/dist/*.AppImage");
  });
});
