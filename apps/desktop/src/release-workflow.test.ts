import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("release.yml workflow configuration", () => {
  const rootDir = path.resolve(__dirname, "../../..");
  const releaseWorkflowPath = path.join(rootDir, ".github/workflows/release.yml");

  const releaseUrlGuardPath = path.join(
    rootDir,
    "apps/desktop/src/release/require-https-api-url.mjs",
  );

  it("accepts HTTPS release URLs and rejects HTTP or malformed URLs", () => {
    const runGuard = (url: string) =>
      spawnSync(process.execPath, [releaseUrlGuardPath], {
        encoding: "utf8",
        env: { ...process.env, JEVSCHEDULE_API_URL: url },
      });

    expect(runGuard("https://api.example").status).toBe(0);
    expect(runGuard("http://api.example").status).toBe(1);
    expect(runGuard("not a URL").status).toBe(1);
    expect(runGuard("").status).toBe(1);
  });

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

  it("disables electron-builder publishing and grants release upload permissions", () => {
    const workflow = fs.readFileSync(releaseWorkflowPath, "utf-8");
    const installerIndex = workflow.indexOf("name: Build Desktop Installer");
    const nextStepIndex = workflow.indexOf("\n      - name:", installerIndex + 1);
    const installerStep = workflow.slice(installerIndex, nextStepIndex);
    expect(workflow).toMatch(/^permissions:\r?\n {2}contents: write$/m);
    expect(installerStep).not.toContain("GH_TOKEN");

    const builderConfigPath = path.join(rootDir, "apps/desktop/electron-builder.json");
    const builderConfig = JSON.parse(fs.readFileSync(builderConfigPath, "utf-8")) as {
      publish: null;
    };
    expect(builderConfig.publish).toBeNull();

    const packagePath = path.join(rootDir, "apps/desktop/package.json");
    const desktopPackage = JSON.parse(fs.readFileSync(packagePath, "utf-8")) as {
      scripts: Record<string, string>;
    };
    for (const name of ["dist", "dist:win", "dist:mac", "dist:linux"]) {
      expect(desktopPackage.scripts[name]).toContain("--publish never");
    }
  });

  it("uses softprops/action-gh-release to upload release installer assets", () => {
    const content = fs.readFileSync(releaseWorkflowPath, "utf-8");

    expect(content).toContain("softprops/action-gh-release");
    expect(content).toContain("apps/desktop/dist/*.exe");
    expect(content).toContain("apps/desktop/dist/*.dmg");
    expect(content).toContain("apps/desktop/dist/*.AppImage");
  });

  it("allows a local API fallback and passes an optional configured URL to installers", () => {
    const content = fs.readFileSync(releaseWorkflowPath, "utf-8");
    const httpsGuardIndex = content.indexOf("name: Require HTTPS production API URL");
    const buildIndex = content.indexOf("name: Build packages");
    const installerIndex = content.indexOf("name: Build Desktop Installer");
    const nextHttpsGuardStepIndex = content.indexOf("\n      - name:", httpsGuardIndex + 1);
    const nextInstallerStepIndex = content.indexOf("\n      - name:", installerIndex + 1);
    const httpsGuardStep = content.slice(httpsGuardIndex, nextHttpsGuardStepIndex);
    const installerStep = content.slice(installerIndex, nextInstallerStepIndex);

    expect(content).not.toContain("name: Require production API URL");
    expect(httpsGuardIndex).toBeGreaterThan(-1);
    expect(httpsGuardIndex).toBeLessThan(buildIndex);
    expect(httpsGuardStep).toContain("if: ${{ vars.JEVSCHEDULE_API_URL != '' }}");
    expect(httpsGuardStep).toContain("JEVSCHEDULE_API_URL: ${{ vars.JEVSCHEDULE_API_URL }}");
    expect(httpsGuardStep).toContain(
      "run: node apps/desktop/src/release/require-https-api-url.mjs",
    );
    expect(installerIndex).toBeGreaterThan(httpsGuardIndex);
    expect(installerStep).toContain("MAIN_VITE_API_URL: ${{ vars.JEVSCHEDULE_API_URL }}");
    expect(installerStep).toContain(
      "CSC_IDENTITY_AUTO_DISCOVERY: ${{ runner.os == 'macOS' && 'false' || '' }}",
    );

    const builderConfigPath = path.join(rootDir, "apps/desktop/electron-builder.json");
    const builderConfig = JSON.parse(fs.readFileSync(builderConfigPath, "utf-8")) as {
      mac: { notarize?: boolean; hardenedRuntime?: boolean; entitlements?: string };
      win: Record<string, unknown>;
    };
    expect(builderConfig.mac.notarize).toBe(false);
    expect(builderConfig.mac.hardenedRuntime).toBe(true);
    expect(builderConfig.mac.entitlements).toBe("build/entitlements.mac.plist");
    expect(builderConfig.win).not.toHaveProperty("publisherName");
  });

  it("uses a Linux-safe executable name and lets all release platforms finish", () => {
    const workflow = fs.readFileSync(releaseWorkflowPath, "utf-8");
    expect(workflow).toMatch(/strategy:\r?\n\s+fail-fast: false\r?\n\s+matrix:/);

    const builderConfigPath = path.join(rootDir, "apps/desktop/electron-builder.json");
    const builderConfig = JSON.parse(fs.readFileSync(builderConfigPath, "utf-8")) as {
      linux: { executableName?: string };
    };
    expect(builderConfig.linux.executableName).toBe("jevschedule");
  });
});
