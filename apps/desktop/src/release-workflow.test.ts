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

  it("requires the production API URL before building and passes it to the installer", () => {
    const content = fs.readFileSync(releaseWorkflowPath, "utf-8");
    const guardIndex = content.indexOf("name: Require production API URL");
    const httpsGuardIndex = content.indexOf("name: Require HTTPS production API URL");
    const buildIndex = content.indexOf("name: Build packages");
    const installerIndex = content.indexOf("name: Build Desktop Installer");
    const nextGuardStepIndex = content.indexOf("\n      - name:", guardIndex + 1);
    const nextHttpsGuardStepIndex = content.indexOf("\n      - name:", httpsGuardIndex + 1);
    const nextInstallerStepIndex = content.indexOf("\n      - name:", installerIndex + 1);
    const guardStep = content.slice(guardIndex, nextGuardStepIndex);
    const httpsGuardStep = content.slice(httpsGuardIndex, nextHttpsGuardStepIndex);
    const installerStep = content.slice(installerIndex, nextInstallerStepIndex);

    expect(guardIndex).toBeGreaterThan(-1);
    expect(guardIndex).toBeLessThan(buildIndex);
    expect(guardStep).toContain("if: ${{ vars.JEVSCHEDULE_API_URL == '' }}");
    expect(guardStep).toContain('echo "Set the JEVSCHEDULE_API_URL repository variable" && exit 1');
    expect(httpsGuardIndex).toBeGreaterThan(guardIndex);
    expect(httpsGuardIndex).toBeLessThan(buildIndex);
    expect(httpsGuardStep).toContain("JEVSCHEDULE_API_URL: ${{ vars.JEVSCHEDULE_API_URL }}");
    expect(httpsGuardStep).toContain("new URL(");
    expect(httpsGuardStep).toContain("protocol !== 'https:'");
    expect(installerIndex).toBeGreaterThan(httpsGuardIndex);
    expect(installerStep).toContain("MAIN_VITE_API_URL: ${{ vars.JEVSCHEDULE_API_URL }}");
  });
});
