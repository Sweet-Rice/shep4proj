import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("code signing & notarization configuration", () => {
  const rootDir = path.resolve(__dirname, "../../..");
  const desktopDir = path.resolve(__dirname, "..");
  const builderConfigPath = path.join(desktopDir, "electron-builder.json");
  const entitlementsPath = path.join(desktopDir, "build", "entitlements.mac.plist");
  const releaseWorkflowPath = path.join(rootDir, ".github/workflows/release.yml");

  it("configures macOS hardened runtime, entitlements, and notarization in electron-builder.json", () => {
    expect(fs.existsSync(builderConfigPath)).toBe(true);

    const config = JSON.parse(fs.readFileSync(builderConfigPath, "utf-8")) as {
      mac: {
        hardenedRuntime?: boolean;
        entitlements?: string;
        notarize?: Record<string, unknown> | boolean;
      };
      win: Record<string, unknown>;
    };

    expect(config.mac.hardenedRuntime).toBe(true);
    expect(config.mac.entitlements).toBe("build/entitlements.mac.plist");
    expect(config.mac.notarize).toBeDefined();
  });

  it("provides macOS entitlements.mac.plist file for security entitlements", () => {
    expect(fs.existsSync(entitlementsPath)).toBe(true);

    const plistContent = fs.readFileSync(entitlementsPath, "utf-8");
    expect(plistContent).toContain("com.apple.security.cs.allow-unsigned-executable-memory");
    expect(plistContent).toContain("com.apple.security.cs.allow-jit");
  });

  it("passes code signing secrets in release.yml workflow", () => {
    expect(fs.existsSync(releaseWorkflowPath)).toBe(true);

    const workflow = fs.readFileSync(releaseWorkflowPath, "utf-8");
    expect(workflow).toContain("CSC_LINK:");
    expect(workflow).toContain("CSC_KEY_PASSWORD:");
    expect(workflow).toContain("APPLE_ID:");
    expect(workflow).toContain("APPLE_APP_SPECIFIC_PASSWORD:");
    expect(workflow).toContain("APPLE_TEAM_ID:");
  });
});
